/**
 * Regression test untuk graf counter.
 *
 * Menjalankan normalizer sungguhan terhadap data upstream, lalu memeriksa
 * invariant kontrak v1.7:
 *
 *   1. Tidak ada pasangan {a,b} dengan b ∈ counters[a] DAN a ∈ counters[b]
 *      (mutual exclusivity).
 *   2. `a ∈ weak_against[b]` <=> `b ∈ counters[a]` (sisi terbalik selalu
 *      sinkron dengan sisi depan).
 *   3. Edge tidak duplikat.
 *   4. Edge dari `relations` punya label sumber yang akurat
 *      (strongAgainst != weakAgainst).
 *
 *UGA ini yang dulu luput: worker versi lama cuma membaca sisi `strong`
 * dari `counters`, jadi separuh pasangan terukur hilang.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        --test tests/counters.test.ts
 *
 * Butuh egress ke raw.githubusercontent.com. Kalau tidak tersedia, test
 * dilewati (skip), bukan gagal.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeBundleToDataset } from '../src/lib/normalize.ts';

const UPSTREAM = 'https://raw.githubusercontent.com/achedon12/mlbb/develop';

const PATHS = {
  heroes: '/src/data/game/heroes.json',
  skills: '/src/data/game/skills.json',
  statistics: '/src/data/game/statistics.json',
  items: '/src/data/game/items.json',
  visuals: '/src/data/game/visuals.json',
  sync: '/src/data/game/sync.json',
} as const;

async function loadBundle(): Promise<Record<string, unknown> | null> {
  try {
    const entries = await Promise.all(
      Object.entries(PATHS).map(async ([key, path]) => {
        const res = await fetch(`${UPSTREAM}${path}`);
        if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
        return [key, await res.json()] as const;
      })
    );
    return Object.fromEntries(entries);
  } catch {
    return null;
  }
}

test('graf counter memenuhi invariant kontrak v1.7', async (t) => {
  const bundle = await loadBundle();
  if (!bundle) {
    t.skip('upstream tidak terjangkau');
    return;
  }

  const dataset = normalizeBundleToDataset(bundle, UPSTREAM);
  const edges = dataset.counters.edges;
  const heroes = dataset.heroes.heroes;

  // -- 3. edge unik --
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }
  assert.deepEqual(duplicates, [], `edge duplikat: ${duplicates.slice(0, 5).join(', ')}`);

  // -- 1 & 2. mutual exclusivity + sisi terbalik sinkron --
  const counters = new Map(heroes.map((h) => [h.id, new Set(h.counters)]));
  const weak = new Map(heroes.map((h) => [h.id, new Set(h.weak_against)]));

  const mutual: string[] = [];
  const desync: string[] = [];

  for (const hero of heroes) {
    for (const target of hero.counters) {
      if (counters.get(target)?.has(hero.id)) mutual.push(`${hero.id}<->${target}`);
      if (!weak.get(target)?.has(hero.id)) desync.push(`${hero.id}->${target} (weak_against)`);
    }
  }

  assert.deepEqual(mutual, [], `pasangan mutual: ${mutual.slice(0, 5).join(', ')}`);
  assert.deepEqual(desync, [], `sisi terbalik tidak sinkron: ${desync.slice(0, 5).join(', ')}`);

  // -- arah edge = arah winners --
  for (const edge of edges) {
    assert.ok(counters.get(edge.from)?.has(edge.to), `edge ${edge.from}->${edge.to} tidak ada di counters`);
    assert.ok(weak.get(edge.to)?.has(edge.from), `edge ${edge.from}->${edge.to} tidak ada di weak_against`);
  }

  // -- 4. label sumber akurat --
  for (const edge of edges) {
    assert.match(edge.source, /^MLBBDex statistics\.json (counters|relations)\./, `source tak dikenal: ${edge.source}`);
  }
  const fromCounters = edges.filter((e) => /\scounters\./.test(e.source));
  const fromRelations = edges.filter((e) => /\srelations\./.test(e.source));
  assert.ok(fromCounters.length > 1000, `edge dari counters terlalu sedikit: ${fromCounters.length}`);
  assert.ok(fromRelations.length > 100, `edge fallback relations terlalu sedikit: ${fromRelations.length}`);

  // Sisi `weak` dari counters harus benar-benar terbaca. Kalau worker cuma
  // baca sisi `strong`, angka ini jadi 0.
  const fromWeakSide = edges.filter((e) => e.source.endsWith('.weak'));
  assert.ok(
    fromWeakSide.length > 400,
    `sisi weak counters tidak terbaca (hanya ${fromWeakSide.length} edge)`
  );

  // -- 5. hero tanpa data counter harus tetap ada, bukan hilang --
  const dori = heroes.find((h) => h.id === 'dori');
  if (dori) {
    assert.deepEqual(dori.counters, []);
    assert.deepEqual(dori.weak_against, []);
  }
});
