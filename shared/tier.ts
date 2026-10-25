/**
 * Perhitungan tier - dipakai BERSAMA oleh worker (edge) dan web (client).
 *
 * Satu sumber kebenaran supaya angka yang tampil di situs tidak pernah beda
 * dengan yang dihitung di edge.
 *
 * Formula (configurable lewat WEIGHTS):
 *
 *     tierScore = (winRate - 50) + pickRate * weightP + banRate * weightB
 *
 * `winRate` / `pickRate` / `banRate` datang sebagai PERSEN (61.03 = 61.03%).
 * Bentuk `(winRate - 0.5) * 100` pada brief adalah hal yang sama dengan
 * winRate dinormalisasi ke fraksi 0..1, jadi keduanya setara setelah satuan
 * diseragamkan.
 *
 * Nilai default sengaja meniru aturan tier list MLBBDex sendiri
 * (`src/lib/tier-list.ts` di repo upstream): score = winRate + banRate * 0.25
 * dengan ambang 56 / 53 / 50.5 / 48. Itu persis formula di atas dengan
 * `weightP = 0` dan ambang yang digeser 50. Diuji cocok untuk 133/133 hero
 * yang punya rate.
 *
 * Kenapa `weightP` default 0? Pick rate mengukur popularitas, bukan kekuatan
 * - upstream dengan alasan yang sama. Naikkan kalau ingin memperhitungkan
 * kehadiran meta.
 */

/** Bobot tier score. */
export const WEIGHTS = {
  /** Bobot pick rate. 0 = popularitas diabaikan. */
  weightP: 0,
  /** Bobot ban rate. 0.25 = nilai MLBBDex. */
  weightB: 0.25,
} as const;

/** Ambang tier pada `tierScore`. */
export const TIER_BOUNDS: readonly (readonly [string, number])[] = [
  ['S+', 6],
  ['S', 3],
  ['A', 0.5],
  ['B', -2],
  ['C', Number.NEGATIVE_INFINITY],
];

export const TIER_ORDER = ['S+', 'S', 'A', 'B', 'C'] as const;

export type Tier = (typeof TIER_ORDER)[number];

export interface RateInput {
  win_rate: number | null | undefined;
  pick_rate?: number | null;
  ban_rate?: number | null;
}

/** Tier score dalam "poin" (0 = win rate 50%). */
export function tierScore(rate: RateInput): number | null {
  const win = rate.win_rate;
  if (win === null || win === undefined || !Number.isFinite(win)) return null;
  return (
    win - 50 + (rate.pick_rate ?? 0) * WEIGHTS.weightP + (rate.ban_rate ?? 0) * WEIGHTS.weightB
  );
}

/** Label tier dari tier score. */
export function tierFromScore(score: number): Tier {
  for (const [tier, bound] of TIER_BOUNDS) {
    if (score >= bound) return tier as Tier;
  }
  return 'C';
}

/** Tier score + label sekaligus. */
export function tierOf(rate: RateInput): { score: number | null; tier: Tier | null } {
  const score = tierScore(rate);
  return { score, tier: score === null ? null : tierFromScore(score) };
}

/** Nilai tier -> angka, untuk perbandingan (S+ tertinggi). */
export function tierRank(tier: string | null | undefined): number {
  const index = TIER_ORDER.indexOf((tier ?? '') as Tier);
  return index === -1 ? TIER_ORDER.length : index;
}
