export interface Env {
  MLBB_KV?: KVNamespace;
  UPSTREAM_BASE_URL?: string;
  ALLOWED_ORIGIN?: string;
  MANUAL_REFRESH_TOKEN?: string;
  CRON_HOUR_UTC?: string;
  DATA_CACHE_SECONDS?: string;
}

export interface SourceEntry {
  name: string;
  url: string;
  license: string;
  retrieved_at_utc: string;
  records: number;
  status: 'ok' | 'failed';
}

import type { RatesSummary } from '../../shared/types';

export interface Manifest {
  schema_version: '1.0.0';
  generated_at_utc: string;
  game_patch: string | null;
  counts: {
    heroes: number;
    maps: number;
    counter_edges: number;
    items: number;
    rated_heroes?: number;
  };
  /**
   * Ringkasan rate meta. Dihitung dari `rankings.rates` saat normalisasi,
   * supaya situs bisa menampilkan rata-rata win rate, hero paling di-ban, dan
   * hero paling di-pick tanpa menghitung ulang (dan tanpa data hardcoded).
   */
  rates_summary?: RatesSummary;
  sources: SourceEntry[];
  warnings: string[];
}

export type { RateHighlight, RatesSummary } from '../../shared/types';

export interface HeroSkill {
  id: string;
  name: string;
  type: 'passive' | 'active';
  label: string | null;
  description: string | null;
  cooldown: string | null;
  mana_cost: string | null;
  icon_url: string | null;
}

/** Satu baris rate untuk satu rank bracket. */
export interface HeroRateRow {
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
  tier: string | null;
}

export interface HeroStats {
  tier: string | null;
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
  rank_scope: string | null;
  updated_at_utc: string | null;
  /** Rate per rank bracket (all/epic/legend/mythic/honor/glory). */
  rates_by_rank: Record<string, HeroRateRow> | null;
}

export interface Hero {
  id: string;
  name: string;
  roles: string[];
  lanes: string[];
  speciality: string[];
  difficulty: number | null;
  release_year: number | null;
  price: number | null;
  portrait_url: string | null;
  icon_url: string | null;
  illustration_url: string | null;
  title: string | null;
  damage_type: string | null;
  attack_type: string | null;
  resource: string | null;
  region: string | null;
  ratings: {
    offense: number | null;
    durability: number | null;
    ability_effect: number | null;
    difficulty: number | null;
  } | null;
  base_stats: Record<string, number | null> | null;
  skills: HeroSkill[];
  counters: string[];
  weak_against: string[];
  synergies: string[];
  stats: HeroStats | null;
}

export interface CounterEdge {
  from: string;
  to: string;
  relation: 'counters';
  strength: number | null;
  advantage_points: number | null;
  source: string;
  /** Rank sumber yang dipakai edge ini (`all`, `epic`, ... atau `relations`). */
  rank: string;
}

export interface Item {
  id: string;
  name: string;
  summary: string | null;
  category: string | null;
  price: number | null;
  bonus: string | null;
  unique: string | null;
  passive: string | null;
  active: string | null;
  recipe: string[];
  best_for: string | null;
  icon_url: string | null;
}

export interface DatasetPayload {
  manifest: Manifest;
  heroes: { heroes: Hero[] };
  counters: { edges: CounterEdge[]; generated_at_utc: string };
  items: { items: Item[] };
  maps: { maps: unknown[] };
}

export interface RuntimeMeta {
  status: 'live' | 'stale' | 'error' | 'bootstrapping';
  source: string;
  patch: string | null;
  totalHeroes: number;
  lastUpdated: string | null;
  lastAttemptAt: string | null;
  nextUpdateAt: string | null;
  scheduleUtc: string;
  lastError: string | null;
}

export interface StoredDataset {
  payload: DatasetPayload;
  storedAt: string;
}
