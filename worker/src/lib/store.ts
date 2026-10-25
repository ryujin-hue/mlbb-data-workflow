/**
 * Penyimpanan snapshot versi.
 *
 * KV sebelum ini cuma punya satu kunci (`mlbb:dataset:latest`) yang ditimpa
 * setiap refresh. Itu cukup untuk "tampilkan data terbaru", tapi tidak cukup
 * untuk:
 *   - window 1d / 7d / 30d (butuh riwayat)
 *   - Meta Movers (butuh dua snapshot untuk dibandingkan)
 *
 * Skema sekarang:
 *   mlbb:snap:<version>  -> StoredSnapshot (immutable, tidak pernah ditulis ulang)
 *   mlbb:snap:index      -> SnapshotIndex (daftar versi, terbaru di depan)
 *   mlbb:dataset:latest  -> pointer ke versi terkini (tetap ada, biar kompatibel)
 *   mlbb:meta:latest     -> RuntimeMeta (tetap ada)
 *
 * Versi = timestamp snapshot terukur (ISO dengan ':' diganti '-'), jadi
 * urutannya天然 chronologis dan aman dipakai sebagai kunci KV.
 *
 * Retensi: `MAX_SNAPSHOTS` versi terakhir disimpan (default 45 ~= 45 hari).
 * Snapshot lama dibuang supaya KV tidak membengkak.
 */
import type { DatasetPayload, RuntimeMeta, StoredDataset } from '../types';

const META_KEY = 'mlbb:meta:latest';
const DATASET_KEY = 'mlbb:dataset:latest';
const INDEX_KEY = 'mlbb:snap:index';
const SNAPSHOT_PREFIX = 'mlbb:snap:';

/** Berapa banyak versi yang disimpan. 45 hari cukup untuk window 30d + buffer. */
export const MAX_SNAPSHOTS = 45;

export interface SnapshotEntry {
  version: string;
  measured_at_utc: string | null;
  stored_at: string;
  counts: {
    heroes: number;
    counter_edges: number;
    items: number;
    rated_heroes: number;
  };
}

export interface SnapshotIndex {
  entries: SnapshotEntry[];
}

let memoryMeta: RuntimeMeta | null = null;
let memoryDataset: StoredDataset | null = null;
let memoryIndex: SnapshotIndex = { entries: [] };

export async function readMeta(kv?: KVNamespace): Promise<RuntimeMeta | null> {
  if (!kv) return memoryMeta;

  const value = await kv.get<RuntimeMeta>(META_KEY, 'json');
  memoryMeta = value ?? memoryMeta;
  return value;
}

export async function writeMeta(kv: KVNamespace | undefined, meta: RuntimeMeta): Promise<void> {
  memoryMeta = meta;
  if (kv) {
    await kv.put(META_KEY, JSON.stringify(meta));
  }
}

export async function readDataset(kv?: KVNamespace): Promise<StoredDataset | null> {
  if (!kv) return memoryDataset;

  const value = await kv.get<StoredDataset>(DATASET_KEY, 'json');
  memoryDataset = value ?? memoryDataset;
  return value;
}

/**
 * Tulis snapshot baru sebagai versi yang immutable, lalu perbarui index dan
 * pointer `latest`. Version yang sama tidak ditulis dua kali.
 */
export async function writeDataset(
  kv: KVNamespace | undefined,
  payload: DatasetPayload,
  storedAt: string
): Promise<SnapshotEntry> {
  const wrapped: StoredDataset = { payload, storedAt };
  memoryDataset = wrapped;

  const measuredAt = payload.manifest?.rates_summary?.measured_at_utc ?? null;
  const version = versionFrom(storedAt);

  const entry: SnapshotEntry = {
    version,
    measured_at_utc: measuredAt,
    stored_at: storedAt,
    counts: {
      heroes: payload.manifest?.counts?.heroes ?? 0,
      counter_edges: payload.manifest?.counts?.counter_edges ?? 0,
      items: payload.manifest?.counts?.items ?? 0,
      rated_heroes: payload.manifest?.counts?.rated_heroes ?? 0,
    },
  };

  if (kv) {
    // Versi immutable: jangan pernah ditulis ulang. Kalau key-nya sudah ada,
    // snapshot-nya identik (refresh dalam window yang sama) - lewati.
    const existing = await kv.get(SNAPSHOT_PREFIX + version);
    if (!existing) {
      await kv.put(SNAPSHOT_PREFIX + version, JSON.stringify(wrapped));
    }

    const index = await readIndex(kv);
    const entries = [entry, ...index.entries.filter((e) => e.version !== version)].slice(
      0,
      MAX_SNAPSHOTS
    );
    await kv.put(INDEX_KEY, JSON.stringify({ entries }));

    // Buang versi yang sudah keluar dari retensi.
    const keep = new Set(entries.map((e) => e.version));
    for (const stale of index.entries) {
      if (!keep.has(stale.version)) {
        await kv.delete(SNAPSHOT_PREFIX + stale.version);
      }
    }

    await kv.put(DATASET_KEY, JSON.stringify(wrapped));
  }

  memoryIndex = {
    entries: [entry, ...memoryIndex.entries.filter((e) => e.version !== version)].slice(
      0,
      MAX_SNAPSHOTS
    ),
  };

  return entry;
}

/**
 * Reset state in-memory. Cuma untuk test - di produksi tidak pernah dipanggil.
 *
 * `memoryIndex` itu cache write-through: dipakai kalau KV belum punya kunci
 * index (mis. setelah eviction), supaya history lokal isolate tidak hilang.
 * Karena livedi module scope, test yang memakai KV sendiri perlu membersihkannya
 * supaya tidak ada history dari test sebelumnya yang bocor.
 */
export function __resetMemoryState(): void {
  memoryMeta = null;
  memoryDataset = null;
  memoryIndex = { entries: [] };
}

export async function readIndex(kv?: KVNamespace): Promise<SnapshotIndex> {
  if (!kv) return memoryIndex;

  const value = await kv.get<SnapshotIndex>(INDEX_KEY, 'json');
  if (value) memoryIndex = value;
  return memoryIndex;
}

/** Ambil satu versi snapshot. */
export async function readSnapshot(
  kv: KVNamespace | undefined,
  version: string
): Promise<StoredDataset | null> {
  if (!kv) return null;
  return (await kv.get<StoredDataset>(SNAPSHOT_PREFIX + version, 'json')) ?? null;
}

/**
 * Cari versi snapshot yang paling dekat dengan `days` hari ke belakang,
 * relatif terhadap snapshot terbaru yang tersedia.
 */
export async function findSnapshotForDaysAgo(
  kv: KVNamespace | undefined,
  days: number
): Promise<SnapshotEntry | null> {
  const index = await readIndex(kv);
  if (index.entries.length < 2) return null;

  const latest = index.entries[0];
  if (!latest) return null;

  const latestAt = Date.parse(latest.stored_at);
  if (!Number.isFinite(latestAt)) return null;

  // Snapshot terbaru TIDAK boleh jadi pembanding: membandingkan snapshot
  // dengan dirinya sendiri menghasilkan delta nol yang palsu ("naik 0%") dan
  // membuat UI Movers terlihat hidup padahal tidak ada history.
  const candidates = index.entries.slice(1);
  if (candidates.length === 0) return null;

  const windowMs = days * 24 * 60 * 60 * 1000;
  const targetAge = windowMs;
  // Lantai umur: kandidat harus minimal_setengah_window lama, supaya label
  // "7d" tidak diam-dim menampilkan perubahan 1 hari.
  const minAgeMs = Math.max(windowMs / 2, 12 * 60 * 60 * 1000);

  let best: SnapshotEntry | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of candidates) {
    const at = Date.parse(entry.stored_at);
    if (!Number.isFinite(at)) continue;
    const age = latestAt - at;
    if (age < minAgeMs) continue;
    const distance = Math.abs(age - targetAge);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }

  return best;
}

/** Umur snapshot tertua yang tersedia, dalam hari (untuk pesan error). */
export async function oldestSnapshotAgeDays(kv: KVNamespace | undefined): Promise<number | null> {
  const index = await readIndex(kv);
  if (index.entries.length < 2) return null;
  const latest = index.entries[0];
  const oldest = index.entries[index.entries.length - 1];
  if (!latest || !oldest) return null;
  const latestAt = Date.parse(latest.stored_at);
  const oldestAt = Date.parse(oldest.stored_at);
  if (!Number.isFinite(latestAt) || !Number.isFinite(oldestAt)) return null;
  return Math.round(((latestAt - oldestAt) / (24 * 60 * 60 * 1000)) * 10) / 10;
}

function versionFrom(storedAt: string): string {
  return storedAt.replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
}
