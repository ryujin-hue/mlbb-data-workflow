/**
 * Regression test untuk normalisasi worker.
 *
 * Menjalankan normalizer sungguhan terhadap data upstream, lalu memeriksa
 * bahwa win / pick / ban rate benar-benar terisi dan tier cocok dengan
 * aturan tier list MLBBDex.
 *
 *   node --experimental-strip-types --test worker/tests/normalize.test.ts
 *
 * Butuh egress ke raw.githubusercontent.com. Kalau tidak tersedia, test
 * dilewati (skip), bukan gagal.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeBundleToDataset } from '../src/lib/normalize.ts';
import { tierFromScore, WEIGHTS } from '../../shared/tier.ts';

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
  const entries = await Promise.all(
    Object.entries(PATHS).map(async ([key, path]) => {
      const res = await fetch(`${UPSTREAM}${path}`);
      if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
      return [key, await res.json()] as const;
    })
  );
  return Object.fromEntries(entries);
}

test('tier label mengikuti aturan MLBBDex (score = win + ban*0.25)', () => {
  // Masha: win 61.03, ban 35.05 -> 69.79 pada aturan upstream -> S+
  assert.equal(tierFromScore(61.03 + 35.05 * WEIGHTS.weightB - 50), 'S+');
  // Khufra: win 54.71, ban 1.92 -> 55.19 -> S
  assert.equal(tierFromScore(54.71 + 1.92 * WEIGHTS.weightB - 50), 'S');
  // Hanzo: win 49.84, ban 8.73 -> 52.02 -> A
  assert.equal(tierFromScore(49.84 + 8.73 * WEIGHTS.weightB - 50), 'A');
  // Franco: win 41.66, ban 1.67 -> 43.08 -> C
  assert.equal(tierFromScore(41.66 + 1.67 * WEIGHTS.weightB - 50), 'C');
});

test('normalisasi mengisi win/pick/ban rate untuk hampir semua hero', async (t) => {
  let bundle: Record<string, unknown> | null = null;
  try {
    bundle = await loadBundle();
  } catch (error) {
    t.skip(`upstream tidak terjangkau: ${String(error)}`);
    return;
  }
  if (!bundle) return;

  const dataset = normalizeBundleToDataset(bundle as never, UPSTREAM);
  const heroes = dataset.heroes.heroes;

  assert.ok(heroes.length >= 120, `hanya ${heroes.length} hero`);

  const rated = heroes.filter((h) => h.stats && h.stats.win_rate !== null);
  assert.ok(
    rated.length >= heroes.length - 2,
    `hanya ${rated.length}/${heroes.length} hero punya win_rate`
  );

  // Tidak boleh ada rate null untuk hero yang punya angka.
  for (const hero of rated) {
    assert.notEqual(hero.stats?.win_rate, null, `${hero.id} win_rate null`);
    assert.notEqual(hero.stats?.pick_rate, null, `${hero.id} pick_rate null`);
    assert.notEqual(hero.stats?.ban_rate, null, `${hero.id} ban_rate null`);
    assert.ok(hero.stats?.tier, `${hero.id} tier kosong`);
    assert.equal(hero.stats?.rank_scope, 'all');
  }

  // Rate per rank bracket ikut terisi.
  const withRanks = rated.filter((h) => h.stats?.rates_by_rank);
  assert.ok(withRanks.length >= rated.length - 1, 'rates_by_rank belum terisi');
  const first = withRanks[0];
  assert.ok(first?.stats?.rates_by_rank?.all, 'bracket "all" tidak ada');
  assert.ok(first?.stats?.rates_by_rank?.mythic, 'bracket "mythic" tidak ada');

  // Ringkasan manifest.
  const summary = dataset.manifest.rates_summary;
  assert.ok(summary, 'manifest.rates_summary hilang');
  assert.ok(summary.rated_heroes >= 120, `rated_heroes hanya ${summary.rated_heroes}`);
  assert.ok(
    summary.avg_win_rate !== null && summary.avg_win_rate > 30 && summary.avg_win_rate < 70,
    `avg_win_rate tidak masuk akal: ${summary.avg_win_rate}`
  );
  assert.ok(summary.most_banned, 'most_banned tidak ada');
  assert.ok(summary.most_picked, 'most_picked tidak ada');
  assert.ok(summary.highest_win_rate, 'highest_win_rate tidak ada');
  assert.ok(
    Object.keys(summary.avg_win_rate_by_role).length >= 4,
    'avg_win_rate_by_role terlalu sedikit'
  );

  // Hero yang di-rate pertama harus punya rate masuk akal.
  const sample = rated[0];
  assert.ok(sample.stats?.win_rate !== undefined);
  assert.ok((sample.stats?.win_rate ?? 0) >= 0 && (sample.stats?.win_rate ?? 0) <= 100);
  assert.ok((sample.stats?.ban_rate ?? 0) >= 0 && (sample.stats?.ban_rate ?? 0) <= 100);
});
