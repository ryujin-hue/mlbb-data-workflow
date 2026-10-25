/**
 * Lapisan data sisi klien.
 *
 * Tiga lapis, dari yang paling cepat:
 *   1. cache memori (per tab, TTL pendek)
 *   2. IndexedDB (lintas sesi, dipakai untuk fallback offline)
 *   3. jaringan (Worker API)
 *
 * Pola stale-while-revalidate: kalau ada cache, kembalikan LANGSUNG dan
 * perbarui di belakang layar. UI tidak pernah menunggu jaringan untuk data
 * yang sudah pernah dilihat.
 */
import { tierOf } from '@shared/tier';
import type {
  HeroDelta,
  MetaMovers,
  RateRow,
  RatesSummary,
  SnapshotMeta,
  Trend,
} from '@shared/types';

export interface SlimHero {
  id: string;
  name: string;
  title: string | null;
  roles: string[];
  lanes: string[];
  damage_type: string | null;
  attack_type: string | null;
  resource: string | null;
  portrait_url: string | null;
  icon_url: string | null;
  release_year: number | null;
  difficulty: number | null;
  price: number | null;
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
  tier: string | null;
  tier_score: number | null;
  rank_scope: string;
  /**
   * Rate mentah per bracket rank. Client memakainya untuk menghitung ulang
   * angka bracket secara lokal, jadi ganti rank instan dan tetap jalan saat
   * offline - tanpa request ulang ke server.
   */
  rates_by_rank: Record<string, RateRow> | null;
  speciality: string[];
  ratings: {
    offense: number | null;
    durability: number | null;
    ability_effect: number | null;
    difficulty: number | null;
  } | null;
}

/**
 * Hitung ulang angka hero untuk satu bracket rank.
 *
 * Rumus dan ambangnya sama persis dengan yang dipakai Worker
 * (`shared/tier.ts`), jadi hasil di client == hasil di edge.
 */
export function applyRankScope(hero: SlimHero, rank: string): SlimHero {
  if (rank === 'all' || !hero.rates_by_rank) return hero;

  const bracket = hero.rates_by_rank[rank];
  if (!bracket) return hero;

  const { score, tier } = tierOf({
    win_rate: bracket.win_rate,
    pick_rate: bracket.pick_rate,
    ban_rate: bracket.ban_rate,
  });

  return {
    ...hero,
    win_rate: bracket.win_rate,
    pick_rate: bracket.pick_rate,
    ban_rate: bracket.ban_rate,
    tier: tier ?? hero.tier,
    tier_score: score === null ? null : Math.round(score * 100) / 100,
    rank_scope: rank,
  };
}

export interface HeroIndexResponse {
  heroes: SlimHero[];
  manifest: {
    schema_version: string;
    generated_at_utc: string;
    game_patch: string | null;
    counts: {
      heroes: number;
      maps: number;
      counter_edges: number;
      items: number;
      rated_heroes?: number;
    };
    rates_summary: RatesSummary | null;
    sources: { name: string; url: string; license: string; retrieved_at_utc: string }[];
    warnings: string[];
  };
  runtime: { storedAt: string };
}

export interface HeroDetailResponse {
  hero: Record<string, unknown> & { id: string; name: string };
  counters: { edges: unknown[] };
  items: { items: unknown[] };
  runtime: { storedAt: string };
}

export interface DeltaResponse extends MetaMovers {
  /** false = belum ada snapshot pembanding (hari-hari pertama). */
  available: boolean;
  reason?: string;
  message?: string;
  deltas: HeroDelta[];
}

/** Kontrak API Worker. */
export const API = {
  heroIndex: (rank: string) => `/api/heroes?rank=${encodeURIComponent(rank)}`,
  heroDetail: (id: string) => `/api/hero?id=${encodeURIComponent(id)}`,
  deltas: (window: string) => `/api/deltas?window=${encodeURIComponent(window)}`,
  snapshots: () => '/api/snapshots',
  meta: () => '/api/meta',
} as const;

// ------------------------------------------------------------------ memory

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

const memory = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const MEMORY_TTL_MS = 60_000;

// --------------------------------------------------------------- IndexedDB

const DB_NAME = 'mlbb-meta';
const DB_VERSION = 1;
const STORE = 'responses';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
  } catch {
    /* storage penuh atau tidak tersedia - abaikan, cache memori tetap jalan */
  }
}

// ------------------------------------------------------------------ fetch

export interface FetchOptions {
  /** Abort signal dari komponen. */
  signal?: AbortSignal;
  /** Paksa bypass cache memori (tetap menulis ke IndexedDB). */
  force?: boolean;
  /** Kunci cache tambahan, misal nama window. */
  cacheKey?: string;
}

/**
 * Ambil JSON dengan SWR: cache lama dikembalikan seketika, lalu data baru
 * diambil di belakang dan disimpan ke cache.
 */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const key = options.cacheKey ? `${url}::${options.cacheKey}` : url;

  const cached = memory.get(key) as CacheEntry<T> | undefined;
  const fresh = cached && Date.now() - cached.storedAt < MEMORY_TTL_MS;

  if (fresh && !options.force) return cached!.value;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending && !options.force) return pending;

  const request = (async (): Promise<T> => {
    const init: RequestInit = { headers: { Accept: 'application/json' } };
    if (options.signal) init.signal = options.signal;
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`HTTP ${response.status} untuk ${url}`);
    const json = (await response.json()) as T;
    memory.set(key, { value: json, storedAt: Date.now() });
    void idbSet(key, json);
    return json;
  })();

  inflight.set(key, request as Promise<unknown>);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Versi offline-first: kalau jaringan gagal, pakai snapshot terakhir dari
 * IndexedDB. Mengembalikan sumber datanya supaya UI bisa jujur menampilkan
 * "data ini dari cache, terakhir update X".
 */
export async function fetchOfflineFirst<T>(
  url: string,
  options: FetchOptions = {}
): Promise<{ data: T; fromCache: boolean; storedAt: string | null }> {
  const key = options.cacheKey ? `${url}::${options.cacheKey}` : url;
  try {
    const data = await fetchJson<T>(url, options);
    return { data, fromCache: false, storedAt: null };
  } catch (error) {
    const cached = await idbGet<T>(key);
    if (cached) {
      const entry = memory.get(key) as CacheEntry<T> | undefined;
      return { data: cached, fromCache: true, storedAt: entry ? new Date(entry.storedAt).toISOString() : null };
    }
    throw error;
  }
}

/** Kosongkan cache (dipakai tombol "refresh"). */
export function clearMemoryCache(): void {
  memory.clear();
}

export type { HeroDelta, MetaMovers, RatesSummary, SnapshotMeta, Trend };
