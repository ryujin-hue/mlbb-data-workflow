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
  const version = versionFrom(storedAt, measuredAt);

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
  if (index.entries.length === 0) return null;

  const latest = index.entries[0];
  if (!latest) return null;
  const target = Date.parse(latest.stored_at) - days * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(target)) return null;

  let best: SnapshotEntry | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of index.entries) {
    const at = Date.parse(entry.stored_at);
    if (!Number.isFinite(at)) continue;
    const distance = Math.abs(at - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }

  // Snapshot yang dipakai harus beda versi dari yang terbaru, kalau tidak
  // tidak ada yang bisa dibandingkan.
  if (best && best.version === latest.version && index.entries.length > 1) {
    return index.entries[1] ?? null;
  }
  return best;
}

function versionFrom(storedAt: string, measuredAt: string | null): string {
  const base = measuredAt ?? storedAt;
  return base.replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
}
