/**
 * Regression test untuk penyimpanan snapshot versi.
 *
 * Dua bug besar pernah ada di sini dan keduanya klasik "diam-diam nggak
 * jalan":
 *
 *   1. Versi snapshot diturunkan dari `measured_at_utc` milik upstream.
 *      Kalau upstream tidak mengubah data (commit terakhir masih 3 hari
 *      lalu), semua refresh menulis versi yang sama -> hanya ada 1 snapshot
 *      -> delta membandingkan snapshot dengan dirinya sendiri -> Rising /
 *      Falling dan Meta Movers mati total tanpa error.
 *
 *   2. `findSnapshotForDaysAgo` mengembalikan snapshot terbaru kalau itu
 *      satu-satunya snapshot. Efeknya sama: `from === to` tapi API tetap
 *      menjawab `available: true`, jadi UI menampilkan "naik 0%" seolah-olah
 *      ada history.
 *
 * Test ini pakai KV in-memory, jadi tidak butuh egress maupun Cloudflare.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        --test tests/store.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  __resetMemoryState,
  findSnapshotForDaysAgo,
  oldestSnapshotAgeDays,
  readIndex,
  writeDataset,
} from '../src/lib/store.ts';
import type { DatasetPayload } from '../src/types';

// ------------------------------------------------------------- KV in-memory

class FakeKv {
  private map = new Map<string, string>();

  async get(key: string, type?: string): Promise<unknown> {
    const raw = this.map.get(key);
    if (raw === undefined) return null;
    return type === 'json' ? JSON.parse(raw) : raw;
  }

  async put(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

// ------------------------------------------------------------- payload fake

function payload(measuredAt: string, winRate: number): DatasetPayload {
  return {
    manifest: {
      schema_version: '1.9',
      generated_at_utc: measuredAt,
      game_patch: null,
      counts: { heroes: 1, counter_edges: 0, items: 0, rated_heroes: 1 },
      rates_summary: {
        measured_at_utc: measuredAt,
        rated_heroes: 1,
        avg_win_rate: winRate,
        avg_win_rate_by_role: {},
        most_banned: null,
        most_picked: null,
        highest_win_rate: null,
        lowest_win_rate: null,
      },
      sources: [],
      warnings: [],
    },
    heroes: {
      heroes: [
        {
          id: 'test-hero',
          name: 'Test Hero',
          stats: {
            tier: 'A',
            win_rate: winRate,
            pick_rate: 1,
            ban_rate: 2,
            rank_scope: 'all',
            updated_at_utc: measuredAt,
            rates_by_rank: null,
          },
        },
      ],
    },
    counters: { edges: [] },
    items: { items: [] },
  } as unknown as DatasetPayload;
}

const DAY = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------------- tests

test('versi snapshot unik walau measured_at upstream tidak berubah', async () => {
  __resetMemoryState();
  const kv = new FakeKv() as unknown as KVNamespace;

  // Dua refresh berjarak 3 jam, tapi upstream mengukur pada waktu yang SAMA.
  await writeDataset(kv, payload('2026-10-21T13:47:47.419Z', 50), '2026-10-25T02:00:00.000Z');
  await writeDataset(kv, payload('2026-10-21T13:47:47.419Z', 50), '2026-10-25T05:00:00.000Z');

  const index = await readIndex(kv);
  assert.equal(index.entries.length, 2, 'harus ada 2 versi, bukan 1');
  assert.notEqual(index.entries[0].version, index.entries[1].version);
});

test('snapshot terbaru tidak pernah jadi pembanding', async () => {
  __resetMemoryState();
  const kv = new FakeKv() as unknown as KVNamespace;

  await writeDataset(kv, payload('2026-10-21T13:47:47.419Z', 50), '2026-10-25T02:00:00.000Z');

  // Hanya ada satu versi -> tidak ada yang bisa dibandingkan.
  const found = await findSnapshotForDaysAgo(kv, 7);
  assert.equal(found, null, 'snapshot tunggal harus menghasilkan null, bukan dirinya sendiri');
});

test('window 7d memilih snapshot yang cukup lama, bukan yang paling baru', async () => {
  __resetMemoryState();
  const kv = new FakeKv() as unknown as KVNamespace;
  const base = Date.parse('2026-10-25T02:00:00.000Z');

  // Riwayat 10 hari, satu snapshot per hari.
  for (let day = 10; day >= 0; day -= 1) {
    await writeDataset(
      kv,
      payload('2026-10-21T13:47:47.419Z', 50 + (10 - day) / 10),
      new Date(base - day * DAY).toISOString()
    );
  }

  const index = await readIndex(kv);
  assert.equal(index.entries.length, 11);

  const found = await findSnapshotForDaysAgo(kv, 7);
  assert.ok(found, 'snapshot pembanding harus ditemukan');

  const ageDays =
    (base - Date.parse(found.stored_at)) / DAY;
  assert.ok(
    ageDays >= 3.5,
    `umur pembanding ${ageDays.toFixed(2)} hari terlalu baru untuk window 7d`
  );
  assert.ok(
    Math.abs(ageDays - 7) <= 1,
    `umur pembanding ${ageDays.toFixed(2)} hari terlalu jauh dari window 7d`
  );

  // Snapshot terbaru sendiri tidak boleh terpilih.
  assert.notEqual(found.version, index.entries[0].version);
});

test('window 30d menolak kandidat yang terlalu baru', async () => {
  __resetMemoryState();
  const kv = new FakeKv() as unknown as KVNamespace;
  const base = Date.parse('2026-10-25T02:00:00.000Z');

  for (let day = 10; day >= 0; day -= 1) {
    await writeDataset(
      kv,
      payload('2026-10-21T13:47:47.419Z', 50),
      new Date(base - day * DAY).toISOString()
    );
  }

  // Cuma 11 hari history: window 30d tidak boleh diam-dim pakai data 10 hari.
  assert.equal(await findSnapshotForDaysAgo(kv, 30), null);
  assert.equal(await oldestSnapshotAgeDays(kv), 10);
});

test('window 1d memakai snapshot kemarin', async () => {
  __resetMemoryState();
  const kv = new FakeKv() as unknown as KVNamespace;
  const base = Date.parse('2026-10-25T02:00:00.000Z');

  for (let day = 3; day >= 0; day -= 1) {
    await writeDataset(
      kv,
      payload('2026-10-21T13:47:47.419Z', 50),
      new Date(base - day * DAY).toISOString()
    );
  }

  const found = await findSnapshotForDaysAgo(kv, 1);
  assert.ok(found);
  const ageDays = (base - Date.parse(found.stored_at)) / DAY;
  assert.ok(ageDays >= 0.5, `umur ${ageDays} terlalu baru untuk window 1d`);
});
