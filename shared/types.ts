/**
 * Tipe data bersama - dipakai worker (edge) dan web (client).
 *
 * Prinsip: data mentah (statistik yang diukur sumber) dipisahkan dari
 * metrik turunan (tier score, delta, skor komposisi). Yang diukur sumber
 * tidak pernah ditulis ulang; yang turunan selalu bisa dihitung ulang.
 */

// ---------------------------------------------------------------- raw stats

/** Rate untuk satu bracket rank. */
export interface RateRow {
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
}

/** Statistik rank per hero - hasil pengukuran sumber. */
export interface HeroStats {
  tier: string | null;
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
  rank_scope: string | null;
  updated_at_utc: string | null;
  /** Rate per bracket rank (all/epic/legend/mythic/honor/glory). */
  rates_by_rank: Record<string, RateRow> | null;
}

/** Metrik turunan - selalu bisa dihitung ulang dari HeroStats. */
export interface TierScore {
  score: number | null;
  tier: string | null;
}

// ---------------------------------------------------------------- snapshots

/** Satu versi snapshot yang immutable. */
export interface SnapshotMeta {
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
  entries: SnapshotMeta[];
}

export interface RateHighlight {
  id: string;
  name: string;
  value: number;
  win_rate: number | null;
}

/** Ringkasan rate meta - dihitung di edge, dipakai situs untuk strip header. */
export interface RatesSummary {
  measured_at_utc: string | null;
  rated_heroes: number;
  avg_win_rate: number | null;
  avg_win_rate_by_role: Record<string, number>;
  most_banned: RateHighlight | null;
  most_picked: RateHighlight | null;
  highest_win_rate: RateHighlight | null;
  lowest_win_rate: RateHighlight | null;
}

// ------------------------------------------------------------------ deltas

export type Trend = 'rising' | 'falling' | 'steady' | 'new';

/** Perubahan metrik satu hero antara dua snapshot. */
export interface HeroDelta {
  id: string;
  name: string;
  /** Nilai pada snapshot baru. */
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
  tier_score: number | null;
  tier: string | null;
  /** Nilai pada snapshot lama. */
  previous_win_rate: number | null;
  previous_pick_rate: number | null;
  previous_ban_rate: number | null;
  previous_tier_score: number | null;
  previous_tier: string | null;
  /** Selisih (baru - lama), dalam poin persentase / poin tier score. */
  win_rate_delta: number | null;
  pick_rate_delta: number | null;
  ban_rate_delta: number | null;
  tier_score_delta: number | null;
  trend: Trend;
}

export interface MetaMovers {
  window: string;
  threshold: number;
  from: { version: string; measured_at_utc: string | null };
  to: { version: string; measured_at_utc: string | null };
  rising: HeroDelta[];
  falling: HeroDelta[];
  steady: number;
  new_heroes: string[];
}

// ------------------------------------------------------- team composition

/** Satu hero yang dipilih untuk analyzer komposisi tim. */
export interface CompositionMember {
  id: string;
  name: string;
  roles: string[];
  damage_type: string | null;
  /** Skor aggression, 0..1. Turunan. */
  offense: number | null;
  /** Skor CC (crowd control) per tim, 0..1. Turunan. */
  cc: number | null;
  /** Skor tank/frontline, 0..1. Turunan. */
  frontline: number | null;
  /** Skor peel/protect, 0..1. Turunan. */
  peel: number | null;
  /** Skor kontrol objective, 0..1. Turunan. */
  objective: number | null;
}

export interface CompositionScore {
  size: number;
  /** Persentase damage per tipe. */
  damage_distribution: Record<string, number>;
  /** Rata-rata skor CC tim, 0..1. */
  cc_density: number;
  /** Rata-rata skor frontline, 0..1. */
  frontline_score: number;
  /** Rata-rata skor peel, 0..1. */
  peel_score: number;
  /** Rata-rata skor objective, 0..1. */
  objective_score: number;
  /** Rating keseluruhan 0..100. */
  balance_rating: number;
  /** Label ringkas: 'balanced' | 'offensive' | 'defensive' | 'incomplete'. */
  profile: 'balanced' | 'offensive' | 'defensive' | 'incomplete';
  /** Catatan yang bisa ditindaklanjuti. */
  notes: string[];
}
