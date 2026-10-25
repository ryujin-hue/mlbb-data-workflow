/**
 * Team Composition Analyzer - perhitungan murni (tanpa I/O), jalan di client.
 *
 * Semua skor turunan dari data yang sudah ada di dataset:
 *   - `roles`      -> peran tim (Tank/Support/... )
 *   - `damage_type` -> sebaran damage
 *   - `speciality` -> label peran skirmish (Crowd Control, Guard, Initiator, ...)
 *   - `ratings`    -> offense / durability / ability_effect / difficulty (1..10)
 *
 * Tidak ada angka yang diasumsikan: setiap skor diturunkan dari field di
 * atas dan punya aturan yang tertulis di sini.
 */
import type { CompositionScore } from '@shared/types';

import type { SlimHero } from '../data/client';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Bobot tiap speciality untuk skill CC. */
const CC_SPECIALITY: Record<string, number> = {
  'Crowd Control': 1,
  Initiator: 0.7,
  Poke: 0.45,
  'Magic Damage': 0.3,
  Burst: 0.3,
  Damage: 0.3,
  'Mixed Damage': 0.3,
  Finisher: 0.15,
  Support: 0.2,
  Guard: 0.25,
  Regen: 0.1,
  Chase: 0.1,
  Charge: 0.05,
  Push: 0.05,
};

/** Bobot tiap speciality untuk peel (melindungi teammate). */
const PEEL_SPECIALITY: Record<string, number> = {
  Guard: 1,
  Support: 0.85,
  Regen: 0.5,
  Tank: 1,
  'Crowd Control': 0.5,
  Initiator: 0.4,
};

/** Bobot tiap speciality untuk kontrol objective. */
const OBJECTIVE_SPECIALITY: Record<string, number> = {
  Initiator: 1,
  Charge: 0.9,
  Chase: 0.8,
  'Crowd Control': 0.7,
  Guard: 0.5,
  Push: 0.5,
  Support: 0.3,
};

function bestSpeciality(hero: SlimHero, table: Record<string, number>): number {
  let best = 0;
  for (const speciality of hero.speciality) {
    const value = table[speciality];
    if (value !== undefined && value > best) best = value;
  }
  return best;
}

function rating(hero: SlimHero, key: 'offense' | 'durability' | 'ability_effect' | 'difficulty'): number {
  const value = hero.ratings?.[key];
  if (value === null || value === undefined) return 0.5;
  return clamp01(value / 10);
}

/** Skor CC satu hero, 0..1. */
export function ccScore(hero: SlimHero): number {
  const spec = bestSpeciality(hero, CC_SPECIALITY);
  return clamp01(0.6 * spec + 0.4 * rating(hero, 'ability_effect'));
}

/** Skor frontline satu hero, 0..1. */
export function frontlineScore(hero: SlimHero): number {
  const tank = hero.roles.includes('Tank') ? 1 : 0;
  const support = hero.roles.includes('Support') ? 0.3 : 0;
  return clamp01(0.6 * rating(hero, 'durability') + 0.25 * tank + 0.15 * support);
}

/** Skor peel satu hero, 0..1. */
export function peelScore(hero: SlimHero): number {
  const spec = bestSpeciality(hero, PEEL_SPECIALITY);
  const support = hero.roles.includes('Support') ? 1 : 0;
  return clamp01(0.4 * rating(hero, 'durability') + 0.4 * spec + 0.2 * support);
}

/** Skor kontrol objective satu hero, 0..1. */
export function objectiveScore(hero: SlimHero): number {
  const spec = bestSpeciality(hero, OBJECTIVE_SPECIALITY);
  const lane = hero.lanes.includes('Jungle') || hero.lanes.includes('Roam') ? 1 : 0;
  return clamp01(0.35 * spec + 0.35 * lane + 0.3 * rating(hero, 'ability_effect'));
}

/** Skor offense satu hero, 0..1. */
export function offenseScore(hero: SlimHero): number {
  return clamp01(0.65 * rating(hero, 'offense') + 0.35 * bestSpeciality(hero, CC_SPECIALITY));
}

/**
 * Susun skor komposisi tim.
 *
 * `balance_rating` (0..100) composed dari lima sinyal:
 *   0.30 sebaran damage seimbang (magic vs physical)
 *   0.25 keberadaan frontline
 *   0.20 kepadatan CC
 *   0.15 kontrol objective
 *   0.10 kapasitas peel
 *
 * Frontline/CC/objective dinormalisasi terhadap ukuran tim, jadi tim 5 hero
 * tidak otomatis dinilai lebih tinggi daripada tim 1 hero.
 */
export function analyzeComposition(heroes: SlimHero[]): CompositionScore {
  const size = heroes.length;

  if (size === 0) {
    return {
      size: 0,
      damage_distribution: {},
      cc_density: 0,
      frontline_score: 0,
      peel_score: 0,
      objective_score: 0,
      balance_rating: 0,
      profile: 'incomplete',
      notes: ['Pilih minimal satu hero untuk menghitung komposisi.'],
    };
  }

  const damageDistribution: Record<string, number> = {};
  for (const hero of heroes) {
    const key = hero.damage_type ?? 'Unknown';
    damageDistribution[key] = (damageDistribution[key] ?? 0) + 1;
  }
  const damagePercentages: Record<string, number> = {};
  for (const [key, count] of Object.entries(damageDistribution)) {
    damagePercentages[key] = Math.round((count / size) * 1000) / 10;
  }

  const cc = heroes.map(ccScore);
  const frontline = heroes.map(frontlineScore);
  const peel = heroes.map(peelScore);
  const objective = heroes.map(objectiveScore);

  const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

  const ccDensity = mean(cc);
  const frontlineAvg = mean(frontline);
  const peelAvg = mean(peel);
  const objectiveAvg = mean(objective);

  // Sebaran damage: TIM dengan dua tipe damage seimbang dinilai lebih baik
  // daripada tim yang semua damage-nya satu tipe.
  const physical = damagePercentages['Physical'] ?? 0;
  const magic = damagePercentages['Magic'] ?? 0;
  const mixed = damagePercentages['Mixed'] ?? 0;
  const damageBalance = clamp01(1 - Math.abs(physical - magic) / 100 + mixed / 200);

  // Kehadiran peran: tim 5 butuh minimal ~2 tank, ~1.5 CC, ~1.5 objective.
  const frontlinePresence = clamp01((frontlineAvg * size) / 2);
  const ccPresence = clamp01((ccDensity * size) / 1.5);
  const objectivePresence = clamp01((objectiveAvg * size) / 1.5);
  const peelPresence = clamp01((peelAvg * size) / 1.5);

  const balanceRating = Math.round(
    100 *
      (0.3 * damageBalance +
        0.25 * frontlinePresence +
        0.2 * ccPresence +
        0.15 * objectivePresence +
        0.1 * peelPresence)
  );

  const notes: string[] = [];
  if (size < 3) notes.push('Tim ideal berisi 5 hero - komposisi ini belum utuh.');
  if (frontlinePresence < 0.5) {
    notes.push('Frontline tipis: tambahkan Tank atau Support yang tahan banting.');
  }
  if (ccPresence < 0.5) {
    notes.push('CC kurang: belum ada inisiator yang bisa controllingobjective.');
  }
  if (objectivePresence < 0.5) {
    notes.push('Kontrol objective lemah: tambah hero Jungler atau Roamer.');
  }
  if (physical >= 80 || magic >= 80) {
    const missing = physical >= 80 ? 'Magic' : 'Physical';
    notes.push(`Semua damage satu tipe - tambah hero damage ${missing} untuk variasi.`);
  }
  if (size >= 5 && notes.length === 0) {
    notes.push('Komposisi seimbang: frontline, CC, dan objective semuanya terpenuhi.');
  }

  const offense = mean(heroes.map(offenseScore));
  let profile: CompositionScore['profile'] = 'balanced';
  if (size < 3) profile = 'incomplete';
  else if (offense > 0.62 && frontlineAvg < 0.5) profile = 'offensive';
  else if (frontlineAvg > 0.62 && offense < 0.45) profile = 'defensive';

  return {
    size,
    damage_distribution: damagePercentages,
    cc_density: Math.round(ccDensity * 1000) / 1000,
    frontline_score: Math.round(frontlineAvg * 1000) / 1000,
    peel_score: Math.round(peelAvg * 1000) / 1000,
    objective_score: Math.round(objectiveAvg * 1000) / 1000,
    balance_rating: Math.min(100, Math.max(0, balanceRating)),
    profile,
    notes,
  };
}
