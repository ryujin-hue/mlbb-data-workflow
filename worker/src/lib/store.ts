import type { DatasetPayload, RuntimeMeta, StoredDataset } from '../types';

const META_KEY = 'mlbb:meta:latest';
const DATASET_KEY = 'mlbb:dataset:latest';

let memoryMeta: RuntimeMeta | null = null;
let memoryDataset: StoredDataset | null = null;

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

export async function writeDataset(
  kv: KVNamespace | undefined,
  payload: DatasetPayload,
  storedAt: string
): Promise<void> {
  const wrapped: StoredDataset = { payload, storedAt };
  memoryDataset = wrapped;

  if (kv) {
    await kv.put(DATASET_KEY, JSON.stringify(wrapped));
  }
}
