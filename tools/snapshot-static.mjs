#!/usr/bin/env node
/**
 * Bangun snapshot statik (fallback offline + unduhan langsung).
 *
 * Memakai normalizer Worker yang sama, jadi angka rate di snapshot statik
 * identik dengan yang dikeluarkan API `/api/heroes`.
 *
 *   node --experimental-strip-types --import ./worker/tests/register-ts.mjs \
 *        tools/snapshot-static.mjs
 *
 * Output: web/public/dataset/{heroes,manifest,counters,items}.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeBundleToDataset } from '../worker/src/lib/normalize.ts';
import { toSlimHeroes } from '../worker/src/lib/deltas.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM = 'https://raw.githubusercontent.com/achedon12/mlbb/develop';

const PATHS = {
  heroes: '/src/data/game/heroes.json',
  skills: '/src/data/game/skills.json',
  statistics: '/src/data/game/statistics.json',
  items: '/src/data/game/items.json',
  visuals: '/src/data/game/visuals.json',
  sync: '/src/data/game/sync.json',
};

const outDir = join(ROOT, 'web', 'public', 'dataset');
mkdirSync(outDir, { recursive: true });

const entries = await Promise.all(
  Object.entries(PATHS).map(async ([key, path]) => {
    const res = await fetch(`${UPSTREAM}${path}`);
    if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
    return [key, await res.json()];
  })
);

const bundle = Object.fromEntries(entries);
const dataset = normalizeBundleToDataset(bundle, UPSTREAM);
const manifest = dataset.manifest;

const heroes = toSlimHeroes(dataset.heroes.heroes, 'all');

const write = (name, payload) => {
  const file = join(outDir, name);
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const size = Buffer.byteLength(JSON.stringify(payload));
  console.log(`  ${name.padEnd(16)} ${(size / 1024).toFixed(1).padStart(8)} KB`);
};

console.log('Snapshot statik:');
write('heroes.json', { heroes });
write('manifest.json', {
  schema_version: manifest.schema_version,
  generated_at_utc: manifest.generated_at_utc,
  game_patch: manifest.game_patch,
  counts: manifest.counts,
  rates_summary: manifest.rates_summary ?? null,
  sources: manifest.sources,
  warnings: manifest.warnings,
});
write('counters.json', dataset.counters);
write('items.json', dataset.items);

console.log(
  `\nheroes=${manifest.counts.heroes} rated=${manifest.counts.rated_heroes} ` +
    `avg_win_rate=${manifest.rates_summary?.avg_win_rate} ` +
    `most_banned=${manifest.rates_summary?.most_banned?.name}`
);
