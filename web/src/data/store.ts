/**
 * Store global (Zustand).
 *
 * Dipisah jadi dua:
 *   - `useMetaStore`: state meta (filter, sorting, window, tab).
 *   - `useLocalStore`: state yang HARUS bertahan di localStorage
 *     (favorit + catatan hero).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { HeroDelta, RatesSummary, SlimHero } from './client';

export const RANK_OPTIONS = [
  { value: 'all', label: 'All Ranks' },
  { value: 'epic', label: 'Epic' },
  { value: 'legend', label: 'Legend' },
  { value: 'mythic', label: 'Mythic' },
  { value: 'honor', label: 'Honor' },
  { value: 'glory', label: 'Mythical Glory' },
] as const;

export const WINDOW_OPTIONS = [
  { value: '1d', label: '1 hari' },
  { value: '7d', label: '7 hari' },
  { value: '30d', label: '30 hari' },
] as const;

export type SortKey = 'win_rate' | 'pick_rate' | 'ban_rate' | 'tier_score' | 'name' | 'release_year';

export interface SortOption {
  value: SortKey;
  label: string;
}

export const SORT_OPTIONS: SortOption[] = [
  { value: 'tier_score', label: 'Tier Score' },
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'pick_rate', label: 'Pick Rate' },
  { value: 'ban_rate', label: 'Ban Rate' },
  { value: 'name', label: 'Nama' },
  { value: 'release_year', label: 'Tahun Rilis' },
];

export type View = 'heroes' | 'composition' | 'movers' | 'sources';

export interface MetaState {
  view: View;
  rank: string;
  window: string;
  sort: SortKey;
  desc: boolean;
  query: string;
  roles: string[];
  lanes: string[];
  damageTypes: string[];
  /** Ambang delta (poin) untuk ditandai Rising/Falling. */
  moverThreshold: number;
  /** Hero yang dipilih untuk analyzer komposisi tim (maks 5). */
  composition: string[];
  setView: (view: View) => void;
  setRank: (rank: string) => void;
  setWindow: (value: string) => void;
  setSort: (sort: SortKey) => void;
  toggleSortDirection: () => void;
  setQuery: (query: string) => void;
  toggleRole: (role: string) => void;
  toggleLane: (lane: string) => void;
  toggleDamageType: (value: string) => void;
  setMoverThreshold: (value: number) => void;
  toggleComposition: (heroId: string) => void;
  clearComposition: () => void;
}

export const useMetaStore = create<MetaState>((set) => ({
  view: 'heroes',
  rank: 'all',
  window: '7d',
  sort: 'tier_score',
  desc: true,
  query: '',
  roles: [],
  lanes: [],
  damageTypes: [],
  moverThreshold: 0.5,
  composition: [],
  setView: (view) => set({ view }),
  setRank: (rank) => set({ rank }),
  setWindow: (value) => set({ window: value }),
  setSort: (sort) => set((state) => ({ sort, desc: state.sort === sort ? !state.desc : true })),
  toggleSortDirection: () => set((state) => ({ desc: !state.desc })),
  setQuery: (query) => set({ query }),
  toggleRole: (role) =>
    set((state) => ({
      roles: state.roles.includes(role)
        ? state.roles.filter((r) => r !== role)
        : [...state.roles, role],
    })),
  toggleLane: (lane) =>
    set((state) => ({
      lanes: state.lanes.includes(lane)
        ? state.lanes.filter((l) => l !== lane)
        : [...state.lanes, lane],
    })),
  toggleDamageType: (value) =>
    set((state) => ({
      damageTypes: state.damageTypes.includes(value)
        ? state.damageTypes.filter((d) => d !== value)
        : [...state.damageTypes, value],
    })),
  setMoverThreshold: (value) => set({ moverThreshold: value }),
  toggleComposition: (heroId) =>
    set((state) => ({
      composition:
        state.composition.includes(heroId)
          ? state.composition.filter((id) => id !== heroId)
          : state.composition.length >= 5
            ? state.composition
            : [...state.composition, heroId],
    })),
  clearComposition: () => set({ composition: [] }),
}));

export interface LocalState {
  favorites: string[];
  notes: Record<string, string>;
  toggleFavorite: (heroId: string) => void;
  setNote: (heroId: string, note: string) => void;
  clearNote: (heroId: string) => void;
}

/**
 * Persistensi lokal. `zustand/middleware` persist memakai localStorage,
 * jadi favorit dan catatan tetap ada setelah reload - dan tidak pernah
 * dikirim ke server.
 */
export const useLocalStore = create<LocalState>()(
  persist(
    (set) => ({
      favorites: [],
      notes: {},
      toggleFavorite: (heroId) =>
        set((state) => ({
          favorites: state.favorites.includes(heroId)
            ? state.favorites.filter((id) => id !== heroId)
            : [...state.favorites, heroId],
        })),
      setNote: (heroId, note) =>
        set((state) => ({ notes: { ...state.notes, [heroId]: note } })),
      clearNote: (heroId) =>
        set((state) => {
          const next = { ...state.notes };
          delete next[heroId];
          return { notes: next };
        }),
    }),
    {
      name: 'mlbb-meta-local',
      version: 1,
      partialize: (state) => ({ favorites: state.favorites, notes: state.notes }),
    }
  )
);

// --------------------------------------------------------------- selectors

export interface FilteredHero extends SlimHero {
  /** Delta terhadap snapshot pembanding (bisa null). */
  delta: HeroDelta | null;
  trend: 'rising' | 'falling' | 'steady' | 'new' | null;
}

export interface FilterInput {
  heroes: SlimHero[];
  deltas: Map<string, HeroDelta>;
  query: string;
  roles: string[];
  lanes: string[];
  damageTypes: string[];
  sort: SortKey;
  desc: boolean;
  threshold: number;
}

function matches(hero: SlimHero, input: FilterInput): boolean {
  if (input.roles.length > 0 && !input.roles.some((r) => hero.roles.includes(r))) return false;
  if (input.lanes.length > 0 && !input.lanes.some((l) => hero.lanes.includes(l))) return false;
  if (
    input.damageTypes.length > 0 &&
    !input.damageTypes.includes(hero.damage_type ?? 'Unknown')
  ) {
    return false;
  }
  if (input.query) {
    const haystack = [hero.name, hero.title, hero.id, ...hero.roles, ...hero.speciality]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(input.query.toLowerCase())) return false;
  }
  return true;
}

function valueFor(hero: SlimHero, key: SortKey): number | string {
  switch (key) {
    case 'win_rate':
      return hero.win_rate ?? -1;
    case 'pick_rate':
      return hero.pick_rate ?? -1;
    case 'ban_rate':
      return hero.ban_rate ?? -1;
    case 'tier_score':
      return hero.tier_score ?? -999;
    case 'release_year':
      return hero.release_year ?? 0;
    case 'name':
      return hero.name;
  }
}

/** Filter + sort + lampirkan delta dalam satu kali lintasan. */
export function selectHeroes(input: FilterInput): FilteredHero[] {
  const out: FilteredHero[] = [];

  for (const hero of input.heroes) {
    if (!matches(hero, input)) continue;
    const delta = input.deltas.get(hero.id) ?? null;
    const trend = delta ? delta.trend : null;
    out.push({ ...hero, delta, trend });
  }

  const direction = input.desc ? -1 : 1;
  out.sort((a, b) => {
    const left = valueFor(a, input.sort);
    const right = valueFor(b, input.sort);
    if (typeof left === 'string' || typeof right === 'string') {
      return String(left).localeCompare(String(right)) * direction;
    }
    if (left === right) return a.name.localeCompare(b.name);
    return (left - right) * direction;
  });

  return out;
}

/** Ringkasan untuk strip statistik di kepala halaman. */
export function summarize(heroes: SlimHero[], summary: RatesSummary | null) {
  const rated = heroes.filter((h) => h.win_rate !== null);
  const avgWinRate =
    rated.length > 0 ? rated.reduce((sum, h) => sum + (h.win_rate ?? 0), 0) / rated.length : null;

  const mostBanned = heroes
    .filter((h) => h.ban_rate !== null)
    .sort((a, b) => (b.ban_rate ?? 0) - (a.ban_rate ?? 0))[0];

  const mostPicked = heroes
    .filter((h) => h.pick_rate !== null)
    .sort((a, b) => (b.pick_rate ?? 0) - (a.pick_rate ?? 0))[0];

  return {
    avgWinRate: summary?.avg_win_rate ?? avgWinRate,
    avgWinRateByRole: summary?.avg_win_rate_by_role ?? {},
    mostBanned: summary?.most_banned
      ? { id: summary.most_banned.id, name: summary.most_banned.name, value: summary.most_banned.value }
      : mostBanned
        ? { id: mostBanned.id, name: mostBanned.name, value: mostBanned.ban_rate ?? 0 }
        : null,
    mostPicked: summary?.most_picked
      ? { id: summary.most_picked.id, name: summary.most_picked.name, value: summary.most_picked.value }
      : mostPicked
        ? { id: mostPicked.id, name: mostPicked.name, value: mostPicked.pick_rate ?? 0 }
        : null,
    rated: rated.length,
    total: heroes.length,
  };
}
