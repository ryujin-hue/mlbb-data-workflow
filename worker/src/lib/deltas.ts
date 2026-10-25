/**
 * Hitung delta antar snapshot - dasar untuk Meta Movers dan deteksi
 * Rising/Falling.
 *
 * Perhitungan dilakukan di edge supaya client cukup menerima angka yang
 * sudah jadi, bukan dua dataset penuh untuk dibandingkan sendiri.
 */
import { tierFromScore, tierScore } from '../../../shared/tier';
import type { HeroDelta, MetaMovers, Trend } from '../../../shared/types';

export interface SnapshotHeroLike {
  id: string;
  name: string;
  title?: string | null;
  roles?: string[];
  lanes?: string[];
  damage_type?: string | null;
  attack_type?: string | null;
  resource?: string | null;
  portrait_url?: string | null;
  icon_url?: string | null;
  release_year?: number | null;
  difficulty?: number | null;
  price?: number | null;
  speciality?: string[];
  ratings?: {
    offense: number | null;
    durability: number | null;
    ability_effect: number | null;
    difficulty: number | null;
  } | null;
  stats?: {
    win_rate: number | null;
    pick_rate: number | null;
    ban_rate: number | null;
    tier: string | null;
    rates_by_rank?: Record<string, { win_rate: number | null; pick_rate: number | null; ban_rate: number | null }> | null;
  } | null;
}

export interface SnapshotLike {
  version?: string;
  measured_at_utc?: string | null;
  heroes: SnapshotHeroLike[];
}

/** Ambang minimum perubahan (poin) supaya hero tidak bergerak karena noise. */
export const DEFAULT_THRESHOLD = 0.5;

function round(value: number | null): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function scoreOf(hero: SnapshotHeroLike): number | null {
  if (!hero.stats) return null;
  return tierScore({
    win_rate: hero.stats.win_rate,
    pick_rate: hero.stats.pick_rate,
    ban_rate: hero.stats.ban_rate,
  });
}

function trendOf(delta: number | null, threshold: number, isNew: boolean): Trend {
  if (isNew) return 'new';
  if (delta === null) return 'steady';
  if (delta >= threshold) return 'rising';
  if (delta <= -threshold) return 'falling';
  return 'steady';
}

/** Delta per hero antara dua snapshot. */
export function computeDeltas(current: SnapshotLike, previous: SnapshotLike): HeroDelta[] {
  const previousById = new Map(previous.heroes.map((h) => [h.id, h]));
  const deltas: HeroDelta[] = [];

  for (const hero of current.heroes) {
    const before = previousById.get(hero.id);
    const isNew = !before;

    const win = hero.stats?.win_rate ?? null;
    const pick = hero.stats?.pick_rate ?? null;
    const ban = hero.stats?.ban_rate ?? null;
    const score = scoreOf(hero);

    const prevWin = before?.stats?.win_rate ?? null;
    const prevPick = before?.stats?.pick_rate ?? null;
    const prevBan = before?.stats?.ban_rate ?? null;
    const prevScore = before ? scoreOf(before) : null;

    const winDelta = win !== null && prevWin !== null ? win - prevWin : null;
    const pickDelta = pick !== null && prevPick !== null ? pick - prevPick : null;
    const banDelta = ban !== null && prevBan !== null ? ban - prevBan : null;
    const scoreDelta = score !== null && prevScore !== null ? score - prevScore : null;

    deltas.push({
      id: hero.id,
      name: hero.name,
      win_rate: win,
      pick_rate: pick,
      ban_rate: ban,
      tier_score: round(score),
      tier: hero.stats?.tier ?? null,
      previous_win_rate: prevWin,
      previous_pick_rate: prevPick,
      previous_ban_rate: prevBan,
      previous_tier_score: round(prevScore),
      previous_tier: before?.stats?.tier ?? null,
      win_rate_delta: round(winDelta),
      pick_rate_delta: round(pickDelta),
      ban_rate_delta: round(banDelta),
      tier_score_delta: round(scoreDelta),
      trend: trendOf(scoreDelta, DEFAULT_THRESHOLD, isNew),
    });
  }

  return deltas;
}

/**
 * Susun daftar Biggest Movers: hero yang paling naik dan paling turun
 * berdasarkan tier score delta.
 */
export function buildMetaMovers(
  current: SnapshotLike,
  previous: SnapshotLike,
  options: { window: string; threshold?: number; limit?: number }
): MetaMovers {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const limit = options.limit ?? 20;
  const deltas = computeDeltas(current, previous);

  const moving = deltas.filter((d) => d.tier_score_delta !== null);
  const rising = moving
    .filter((d) => (d.tier_score_delta ?? 0) >= threshold)
    .sort((a, b) => (b.tier_score_delta ?? 0) - (a.tier_score_delta ?? 0))
    .slice(0, limit);
  const falling = moving
    .filter((d) => (d.tier_score_delta ?? 0) <= -threshold)
    .sort((a, b) => (a.tier_score_delta ?? 0) - (b.tier_score_delta ?? 0))
    .slice(0, limit);

  const steady = moving.filter(
    (d) => (d.tier_score_delta ?? 0) > -threshold && (d.tier_score_delta ?? 0) < threshold
  ).length;

  return {
    window: options.window,
    threshold,
    from: {
      version: previous.version ?? 'unknown',
      measured_at_utc: previous.measured_at_utc ?? null,
    },
    to: {
      version: current.version ?? 'unknown',
      measured_at_utc: current.measured_at_utc ?? null,
    },
    rising,
    falling,
    steady,
    new_heroes: deltas.filter((d) => d.trend === 'new').map((d) => d.id),
  };
}

// --------------------------------------------------------------- slim index

/**
 * Bentuk hero untuk daftar/grid - hanya field yang dipakai kartu hero.
 * Sengaja tidak membawa skills/counters/skins/base_stats supaya payload
 * daftar jauh lebih kecil daripada dataset penuh.
 */
export interface SlimHero {
  id: string;
  name: string;
  title: string | null;
  roles: string[];
  lanes: string[];
  damage_type: string | null;
  attack_type: string | null;
  resource: string | null;
  portrait_url: string | null;
  icon_url: string | null;
  release_year: number | null;
  difficulty: number | null;
  price: number | null;
  /** Rate pada bracket rank yang dipilih. */
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
  /** Tier pada bracket yang dipilih. */
  tier: string | null;
  /** Tier score pada bracket yang dipilih. */
  tier_score: number | null;
  /** Rank bracket tempat angka di atas berasal. */
  rank_scope: string;
  /**
   * Rate mentah per bracket rank. Matrix ini ikut dikirim supaya client bisa
   * mengganti bracket secara INSTAN (tanpa request ulang) dan tetap bisa
   * grieving saat offline - rumus tier-nya dihitung ulang di client dari
   * `shared/tier.ts`, jadi hasilnya identik dengan yang dihitung di edge.
   */
  rates_by_rank: Record<string, { win_rate: number | null; pick_rate: number | null; ban_rate: number | null }> | null;
  /** Spesialisasi hero (Crowd Control, Guard, Initiator, ...). */
  speciality: string[];
  /** Rating sumber: offense, durability, ability_effect, difficulty. */
  ratings: {
    offense: number | null;
    durability: number | null;
    ability_effect: number | null;
    difficulty: number | null;
  } | null;
}

/**
 * Bentuk slim untuk daftar hero pada bracket rank tertentu.
 *
 * `rank` = 'all' memakai rate utama; bracket lain memakai `rates_by_rank`.
 */
export function toSlimHeroes(
  heroes: SnapshotHeroLike[],
  rank: string
): SlimHero[] {
  return heroes.map((hero) => {
    // PENTING: `rates_by_rank` ada di `hero.stats.rates_by_rank`, BUKAN di
    // `hero.rates_by_rank`. Salah alamat di sini bikin filter rank diam-diam
    // tidak mengubah apa pun.
    const byRank = hero.stats?.rates_by_rank ?? null;
    const bracket = rank === 'all' ? null : byRank?.[rank] ?? null;
    const win = bracket ? bracket.win_rate : hero.stats?.win_rate ?? null;
    const pick = bracket ? bracket.pick_rate : hero.stats?.pick_rate ?? null;
    const ban = bracket ? bracket.ban_rate : hero.stats?.ban_rate ?? null;
    const score = tierScore({ win_rate: win, pick_rate: pick, ban_rate: ban });

    return {
      id: hero.id,
      name: hero.name,
      title: hero.title ?? null,
      roles: hero.roles ?? [],
      lanes: hero.lanes ?? [],
      damage_type: hero.damage_type ?? null,
      attack_type: hero.attack_type ?? null,
      resource: hero.resource ?? null,
      portrait_url: hero.portrait_url ?? null,
      icon_url: hero.icon_url ?? null,
      release_year: hero.release_year ?? null,
      difficulty: hero.difficulty ?? null,
      price: hero.price ?? null,
      win_rate: win,
      pick_rate: pick,
      ban_rate: ban,
      // Tier untuk bracket terpilih dihitung ulang dari rate bracket itu;
      // tier utama hanya berlaku untuk bracket "all".
      tier: score === null ? (hero.stats?.tier ?? null) : tierFromScore(score),
      tier_score: score === null ? null : Math.round(score * 100) / 100,
      rank_scope: rank,
      rates_by_rank: byRank,
      speciality: hero.speciality ?? [],
      ratings: hero.ratings ?? null,
    };
  });
}
