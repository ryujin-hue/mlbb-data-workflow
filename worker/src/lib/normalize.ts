import { clamp, toIsoNow } from './time';
import type {
  CounterEdge,
  DatasetPayload,
  Hero,
  HeroRateRow,
  HeroSkill,
  HeroStats,
  Item,
  Manifest,
  RateHighlight,
  RatesSummary,
  SourceEntry,
} from '../types';
import type { UpstreamBundle } from './fetch-upstream';

const ASSET_BASE = 'https://raw.githubusercontent.com/achedon12/mlbb/develop/public/';
const RANK_PRIORITY = ['all', 'epic', 'legend', 'mythic', 'honor', 'glory'] as const;

/**
 * Tier score.
 *
 * Formula (configurable, see WEIGHTS below):
 *   tierScore = (winRate - 50) + pickRate * weightP + banRate * weightB
 *
 * `winRate`/`pickRate`/`banRate` arrive as PERCENTAGES (e.g. 61.03 means 61.03%).
 * The brief's `(winRate - 0.5) * 100` is the same thing expressed on a 0..1
 * fraction, so the two forms are equivalent once the unit is normalised.
 *
 * Defaults reproduce MLBBDex's own published tier list
 * (src/lib/tier-list.ts upstream): score = winRate + banRate * 0.25 with
 * thresholds 56 / 53 / 50.5 / 48, which is the same formula shifted by the
 * constant 50. Verified to match 133/133 rated heroes.
 *
 * `weightP` defaults to 0 on purpose: pick rate measures popularity, not
 * power - upstream makes the same argument. Raise it to weight meta presence.
 */
export const WEIGHTS = {
  /** Weight of pick rate. 0 = popularity ignored. */
  weightP: 0,
  /** Weight of ban rate. 0.25 = upstream MLBBDex value. */
  weightB: 0.25,
} as const;

/** Tier bounds on `tierScore` (already shifted so 0 == 50% win rate). */
export const TIER_BOUNDS: readonly (readonly [string, number])[] = [
  ['S+', 6],
  ['S', 3],
  ['A', 0.5],
  ['B', -2],
  ['C', Number.NEGATIVE_INFINITY],
];

export function tierFromScore(score: number): string {
  for (const [tier, bound] of TIER_BOUNDS) {
    if (score >= bound) return tier;
  }
  return 'C';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function toAbsoluteAssetUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const cleaned = value.replace(/^\//, '');
  return `${ASSET_BASE}${cleaned}`;
}

function pickPatch(syncRaw: unknown): string | null {
  const sync = asRecord(syncRaw);
  const patches = asArray(sync.patches);
  if (patches.length > 0) {
    return toStr(patches[0]) ?? null;
  }
  return toStr(sync.patch) ?? toStr(sync.version) ?? null;
}

function pickMeasuredAt(statisticsRaw: unknown, syncRaw: unknown): string | null {
  const statistics = asRecord(statisticsRaw);
  const rankings = asRecord(statistics.rankings);
  return toStr(rankings.measuredAt) ?? toStr(asRecord(syncRaw).date) ?? null;
}

function getHeroesArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.map(asRecord);
  const record = asRecord(raw);

  if (Array.isArray(record.heroes)) {
    return record.heroes.map(asRecord);
  }

  return Object.values(record)
    .filter((value) => value && typeof value === 'object')
    .map((value) => asRecord(value));
}

function getSkillsIndex(raw: unknown): Map<string, Record<string, unknown>[]> {
  const index = new Map<string, Record<string, unknown>[]>();

  const push = (heroId: string, skills: unknown[]) => {
    if (!heroId) return;
    index.set(heroId, skills.map(asRecord));
  };

  if (Array.isArray(raw)) {
    for (const row of raw) {
      const item = asRecord(row);
      const heroId = toStr(item.slug) ?? toStr(item.id) ?? toStr(item.hero) ?? '';
      const skills = asArray(item.skills);
      if (heroId && skills.length > 0) {
        push(heroId, skills);
      }
    }
    return index;
  }

  const root = asRecord(raw);
  if (Array.isArray(root.skills)) {
    for (const row of root.skills) {
      const item = asRecord(row);
      const heroId = toStr(item.slug) ?? toStr(item.id) ?? toStr(item.hero) ?? '';
      const skills = asArray(item.skills);
      if (heroId && skills.length > 0) {
        push(heroId, skills);
      }
    }
    return index;
  }

  for (const [heroId, value] of Object.entries(root)) {
    if (Array.isArray(value)) {
      push(heroId, value);
      continue;
    }

    const inner = asRecord(value);
    if (Array.isArray(inner.skills)) {
      push(heroId, inner.skills);
    }
  }

  return index;
}

function getVisuals(raw: unknown): {
  heroes: Record<string, unknown>;
  skills: Record<string, unknown>;
  illustrations: Record<string, unknown>;
  items: Record<string, unknown>;
} {
  const root = asRecord(raw);
  return {
    heroes: asRecord(root.heroes),
    skills: asRecord(root.skills),
    illustrations: asRecord(root.illustrations),
    items: asRecord(root.items),
  };
}

function pickHeroVisual(visualHeroes: Record<string, unknown>, heroId: string): Record<string, unknown> {
  return asRecord(visualHeroes[heroId]);
}

function resolvePortrait(visualHeroes: Record<string, unknown>, heroId: string): string | null {
  const visual = pickHeroVisual(visualHeroes, heroId);
  return (
    toAbsoluteAssetUrl(toStr(visual.portrait)) ??
    toAbsoluteAssetUrl(`visuels/heros/${heroId}/portrait.webp`)
  );
}

function resolveHeroIcon(visualHeroes: Record<string, unknown>, heroId: string): string | null {
  const visual = pickHeroVisual(visualHeroes, heroId);
  return toAbsoluteAssetUrl(toStr(visual.icon));
}

function resolveIllustration(
  visualIllustrations: Record<string, unknown>,
  heroId: string
): string | null {
  const candidate = visualIllustrations[heroId];
  if (!candidate) return null;

  if (typeof candidate === 'string') {
    return toAbsoluteAssetUrl(candidate);
  }

  if (Array.isArray(candidate)) {
    for (const row of candidate) {
      const asString = toStr(row);
      if (asString) return toAbsoluteAssetUrl(asString);

      const asObject = asRecord(row);
      const url = toStr(asObject.url) ?? toStr(asObject.image) ?? toStr(asObject.path);
      if (url) return toAbsoluteAssetUrl(url);
    }
  }

  const asObject = asRecord(candidate);
  for (const value of Object.values(asObject)) {
    const asString = toStr(value);
    if (asString) return toAbsoluteAssetUrl(asString);

    const nested = asRecord(value);
    const nestedUrl = toStr(nested.url) ?? toStr(nested.image) ?? toStr(nested.path);
    if (nestedUrl) return toAbsoluteAssetUrl(nestedUrl);
  }

  return null;
}

function resolveSkillIcon(
  visualSkills: Record<string, unknown>,
  heroId: string,
  skillName: string
): string | null {
  const heroSkills = asRecord(visualSkills[heroId]);
  const byName = heroSkills[skillName] ?? heroSkills[slugify(skillName)] ?? heroSkills[skillName.toLowerCase()];

  if (typeof byName === 'string') {
    return toAbsoluteAssetUrl(byName);
  }

  const byNameObj = asRecord(byName);
  const hinted = toStr(byNameObj.icon) ?? toStr(byNameObj.url) ?? toStr(byNameObj.path);
  if (hinted) {
    return toAbsoluteAssetUrl(hinted);
  }

  return toAbsoluteAssetUrl(`visuels/competences/${slugify(skillName)}.webp`);
}

function normalizeRatings(rawRatings: unknown): Hero['ratings'] {
  const ratings = asRecord(rawRatings);
  if (Object.keys(ratings).length === 0) return null;

  return {
    offense: toNum(ratings.offense),
    durability: toNum(ratings.durability),
    ability_effect: toNum(ratings.ability_effect ?? ratings.abilityEffects),
    difficulty: toNum(ratings.difficulty),
  };
}

function normalizeBaseStats(rawStats: unknown): Record<string, number | null> | null {
  const stats = asRecord(rawStats);
  if (Object.keys(stats).length === 0) return null;

  const out: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(stats)) {
    out[key] = toNum(value);
  }
  return out;
}

interface RateRow {
  win_rate: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
}

function rateRowFrom(raw: unknown): RateRow | null {
  const row = asRecord(raw);
  const win_rate = toNum(row.winRate ?? row.win_rate);
  const pick_rate = toNum(row.pickRate ?? row.pick_rate);
  const ban_rate = toNum(row.banRate ?? row.ban_rate);
  if (win_rate === null && pick_rate === null && ban_rate === null) return null;
  return { win_rate, pick_rate, ban_rate };
}

/**
 * Win / pick / ban rates live in `statistics.json -> rankings.rates`, NOT in
 * the roster's `stats` block. The roster's `stats` holds BASE stats
 * (hp1, hp15, mana1, ...) - reading it for rates silently produced null for
 * every single hero, which is why the site showed "-" for win/pick/ban rate.
 */
function pickRankRates(rawStatistics: unknown): {
  rates: Map<string, RateRow>;
  byRank: Map<string, Map<string, RateRow>>;
} {
  const rankings = asRecord(asRecord(rawStatistics).rankings);
  const rates = new Map<string, RateRow>();
  for (const [heroId, row] of Object.entries(asRecord(rankings.rates))) {
    const parsed = rateRowFrom(row);
    if (parsed) rates.set(heroId, parsed);
  }

  const byRank = new Map<string, Map<string, RateRow>>();
  for (const [rank, table] of Object.entries(asRecord(rankings.byRank))) {
    const map = new Map<string, RateRow>();
    for (const [heroId, row] of Object.entries(asRecord(table))) {
      const parsed = rateRowFrom(row);
      if (parsed) map.set(heroId, parsed);
    }
    byRank.set(rank, map);
  }

  return { rates, byRank };
}

function collectByRankRows(
  heroId: string,
  byRank: Map<string, Map<string, RateRow>>
): Map<string, RateRow> {
  const rows = new Map<string, RateRow>();
  for (const [rank, table] of byRank) {
    const row = table.get(heroId);
    if (row) rows.set(rank, row);
  }
  return rows;
}

function tierScoreOf(row: RateRow): number | null {
  if (row.win_rate === null) return null;
  return (
    row.win_rate -
    50 +
    (row.pick_rate ?? 0) * WEIGHTS.weightP +
    (row.ban_rate ?? 0) * WEIGHTS.weightB
  );
}

function normalizeHeroStats(
  rawHero: Record<string, unknown>,
  measuredRow: RateRow | undefined,
  byRankRows: Map<string, RateRow>,
  measuredAt: string | null
): HeroStats | null {
  // Fallback ke blok `stats` hero kalau upstream ternyata sudah menyertakan
  // rate di sana (mis. dataset hasil normalisasi sebelumnya).
  const fallback = asRecord(rawHero.stats);
  const fallbackHasRate =
    toNum(fallback.win_rate ?? fallback.winRate) !== null ||
    toNum(fallback.pick_rate ?? fallback.pickRate) !== null ||
    toNum(fallback.ban_rate ?? fallback.banRate) !== null;

  const win_rate = measuredRow?.win_rate ?? toNum(fallback.win_rate ?? fallback.winRate);
  const pick_rate = measuredRow?.pick_rate ?? toNum(fallback.pick_rate ?? fallback.pickRate);
  const ban_rate = measuredRow?.ban_rate ?? toNum(fallback.ban_rate ?? fallback.banRate);

  if (win_rate === null && pick_rate === null && ban_rate === null && !fallbackHasRate) {
    return null;
  }

  const scoresByRank: Record<string, HeroRateRow> = {};
  for (const [rank, row] of byRankRows) {
    const score = tierScoreOf(row);
    scoresByRank[rank] = {
      win_rate: row.win_rate,
      pick_rate: row.pick_rate,
      ban_rate: row.ban_rate,
      tier: score === null ? null : tierFromScore(score),
    };
  }

  const score = tierScoreOf({
    win_rate: win_rate ?? null,
    pick_rate: pick_rate ?? null,
    ban_rate: ban_rate ?? null,
  });

  return {
    tier: score === null ? toStr(fallback.tier) : tierFromScore(score),
    win_rate,
    pick_rate,
    ban_rate,
    rank_scope: 'all',
    updated_at_utc: toStr(fallback.updated_at_utc) ?? toStr(fallback.updatedAt) ?? measuredAt,
    rates_by_rank: Object.keys(scoresByRank).length > 0 ? scoresByRank : null,
  };
}

function normalizeResource(raw: unknown): string | null {
  const value = toStr(raw);
  if (!value || value === 'None') return null;
  const residue = value.match(/Resource#([^/|]+)/);
  if (residue) return toStr(residue[1]);
  return value;
}

function normalizeDamage(raw: unknown): string | null {
  const value = toStr(raw);
  if (!value) return null;
  return value === 'Phyiscal' ? 'Physical' : value;
}

function normalizeSkillList(
  heroId: string,
  rawSkills: Record<string, unknown>[],
  visualSkills: Record<string, unknown>
): HeroSkill[] {
  const list = rawSkills.length > 0 ? rawSkills : [];
  const useFixedLabels = list.length === 4;

  return list.map((raw, index) => {
    const name = toStr(raw.name) ?? `Skill ${index + 1}`;

    let label: string | null = null;
    if (useFixedLabels) {
      if (index === 0) label = 'Passive';
      if (index === 1) label = 'Skill 1';
      if (index === 2) label = 'Skill 2';
      if (index === 3) label = 'Ultimate';
    }

    return {
      id: `${heroId}-s${index}`,
      name,
      type: index === 0 ? 'passive' : 'active',
      label,
      description: toStr(raw.description),
      cooldown: toStr(raw.cooldown),
      mana_cost: toStr(raw.mana_cost ?? raw.manaCost),
      icon_url: resolveSkillIcon(visualSkills, heroId, name),
    };
  });
}

function pickCounterRank(rawCounterNode: unknown): { rank: string; node: Record<string, unknown> } | null {
  const counterNode = asRecord(rawCounterNode);

  if (Array.isArray(counterNode.strong) || Array.isArray(counterNode.weak)) {
    return { rank: 'all', node: counterNode };
  }

  for (const rank of RANK_PRIORITY) {
    const candidate = asRecord(counterNode[rank]);
    if (Array.isArray(candidate.strong) || Array.isArray(candidate.weak)) {
      return { rank, node: candidate };
    }
  }

  return null;
}

function getRelations(rawStatistics: unknown): Record<string, unknown> {
  return asRecord(asRecord(rawStatistics).relations);
}

function getCounters(rawStatistics: unknown): Record<string, unknown> {
  return asRecord(asRecord(rawStatistics).counters);
}

function toHeroId(value: unknown): string | null {
  return toStr(value)?.toLowerCase() ?? null;
}

interface CandidateEdge {
  from: string;
  to: string;
  advantage: number | null;
  source: string;
  score: number;
}

function addWarning(warnings: string[], message: string): void {
  if (warnings.length < 100) {
    warnings.push(message);
  }
}

function buildEdges(
  heroIds: Set<string>,
  countersRaw: Record<string, unknown>,
  relationsRaw: Record<string, unknown>,
  warnings: string[]
): CounterEdge[] {
  const candidates: CandidateEdge[] = [];

  for (const heroId of heroIds) {
    const rankNode = pickCounterRank(countersRaw[heroId]);

    if (rankNode) {
      const strongList = asArray(rankNode.node.strong);

      for (const row of strongList) {
        const item = asRecord(row);
        const target = toHeroId(item.slug ?? item.id ?? item.hero);
        if (!target || !heroIds.has(target) || target === heroId) continue;

        const advantage = toNum(item.advantage);
        candidates.push({
          from: heroId,
          to: target,
          advantage,
          source: `MLBBDex statistics counters.${rankNode.rank}.strong`,
          score: Math.abs(advantage ?? 0),
        });
      }
    }

    const relation = asRecord(relationsRaw[heroId]);
    const relationStrong = asArray(relation.strongAgainst);

    for (const row of relationStrong) {
      const target = toHeroId(row);
      if (!target || !heroIds.has(target) || target === heroId) continue;

      candidates.push({
        from: heroId,
        to: target,
        advantage: null,
        source: 'MLBBDex statistics relations.strongAgainst',
        score: 0,
      });
    }
  }

  const direct = new Map<string, CandidateEdge>();

  const keyOf = (from: string, to: string) => `${from}->${to}`;

  for (const edge of candidates) {
    const directKey = keyOf(edge.from, edge.to);
    const reverseKey = keyOf(edge.to, edge.from);

    const existing = direct.get(directKey);
    if (existing) {
      if (edge.score > existing.score) {
        direct.set(directKey, edge);
      }
      continue;
    }

    const reverse = direct.get(reverseKey);
    if (reverse) {
      if (edge.score > reverse.score) {
        direct.delete(reverseKey);
        direct.set(directKey, edge);
        addWarning(warnings, `counter-conflict-resolved: ${edge.from} > ${edge.to} replaced reverse by stronger advantage`);
      } else {
        addWarning(warnings, `counter-conflict-dropped: ${edge.from} -> ${edge.to} ignored due to reverse edge`);
      }
      continue;
    }

    direct.set(directKey, edge);
  }

  const edges: CounterEdge[] = [...direct.values()].map((edge) => {
    const strength = edge.advantage === null ? null : clamp(Math.abs(edge.advantage) / 10, 0, 1);
    return {
      from: edge.from,
      to: edge.to,
      relation: 'counters',
      strength,
      advantage_points: edge.advantage,
      source: edge.source,
    };
  });

  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return edges;
}

function deriveCounterSets(edges: CounterEdge[]): {
  countersByHero: Map<string, Set<string>>;
  weakByHero: Map<string, Set<string>>;
} {
  const countersByHero = new Map<string, Set<string>>();
  const weakByHero = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!countersByHero.has(edge.from)) countersByHero.set(edge.from, new Set());
    if (!weakByHero.has(edge.to)) weakByHero.set(edge.to, new Set());

    countersByHero.get(edge.from)?.add(edge.to);
    weakByHero.get(edge.to)?.add(edge.from);
  }

  return { countersByHero, weakByHero };
}

function normalizeItems(rawItems: unknown, visualsItems: Record<string, unknown>): Item[] {
  const payload = asRecord(rawItems);
  const itemsArray = Array.isArray(payload.items) ? payload.items : Array.isArray(rawItems) ? rawItems : [];

  const items: Item[] = [];
  for (const row of itemsArray) {
    const item = asRecord(row);
    const id = toStr(item.slug) ?? toStr(item.id) ?? slugify(toStr(item.name) ?? 'item');
    const visualEntry = visualsItems[id];
    const iconHint = asRecord(visualEntry);

    const iconSource =
      toStr(item.icon_url) ??
      toStr(item.icon) ??
      (typeof visualEntry === 'string' ? toStr(visualEntry) : null) ??
      toStr(iconHint.url ?? iconHint.path ?? iconHint.icon);

    items.push({
      id,
      name: toStr(item.name) ?? id,
      summary: toStr(item.summary),
      category: toStr(item.category),
      price: toNum(item.price),
      bonus: toStr(item.bonus),
      unique: toStr(item.unique),
      passive: toStr(item.passive),
      active: toStr(item.active),
      recipe: asArray(item.recipe).map((value) => toStr(value)).filter((value): value is string => Boolean(value)),
      best_for: toStr(item.best_for ?? item.bestFor),
      icon_url: toAbsoluteAssetUrl(iconSource) ?? toAbsoluteAssetUrl(`visuels/objets/${id}.webp`),
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

function buildRatesSummary(heroes: Hero[], measuredAt: string | null): RatesSummary {
  const rated = heroes.filter((h) => h.stats && h.stats.win_rate !== null);

  const avg = (values: number[]): number | null =>
    values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;

  const byRole = new Map<string, number[]>();
  for (const hero of rated) {
    const value = hero.stats?.win_rate;
    if (value === null || value === undefined) continue;
    for (const role of hero.roles.length > 0 ? hero.roles : ['Unassigned']) {
      const list = byRole.get(role) ?? [];
      list.push(value);
      byRole.set(role, list);
    }
  }

  const highlight = (
    pick: (h: Hero) => number | null,
    field: 'win_rate' | 'pick_rate' | 'ban_rate'
  ): RateHighlight | null => {
    let best: Hero | null = null;
    let bestValue: number | null = null;
    for (const hero of rated) {
      const value = pick(hero);
      if (value === null) continue;
      if (bestValue === null || value > bestValue) {
        best = hero;
        bestValue = value;
      }
    }
    if (!best || bestValue === null) return null;
    return {
      id: best.id,
      name: best.name,
      value: bestValue,
      win_rate: best.stats?.win_rate ?? null,
    };
  };

  const avgWinRateByRole: Record<string, number> = {};
  for (const [role, values] of [...byRole.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const value = avg(values);
    if (value !== null) avgWinRateByRole[role] = value;
  }

  return {
    measured_at_utc: measuredAt,
    rated_heroes: rated.length,
    avg_win_rate: avg(rated.map((h) => h.stats?.win_rate ?? 0)),
    avg_win_rate_by_role: avgWinRateByRole,
    most_banned: highlight((h) => h.stats?.ban_rate ?? null, 'ban_rate'),
    most_picked: highlight((h) => h.stats?.pick_rate ?? null, 'pick_rate'),
    highest_win_rate: highlight((h) => h.stats?.win_rate ?? null, 'win_rate'),
    lowest_win_rate: (() => {
      const list = rated.filter((h) => h.stats?.win_rate !== null);
      if (list.length === 0) return null;
      const worst = list.reduce((acc, h) =>
        (h.stats?.win_rate ?? Infinity) < (acc.stats?.win_rate ?? Infinity) ? h : acc
      );
      return {
        id: worst.id,
        name: worst.name,
        value: worst.stats?.win_rate ?? 0,
        win_rate: worst.stats?.win_rate ?? null,
      };
    })(),
  };
}

function buildSourceEntries(retrievedAt: string, upstreamBase: string): SourceEntry[] {
  const base = upstreamBase.replace(/\/$/, '');
  return [
    {
      name: 'MLBBDex mirror — heroes',
      url: `${base}/src/data/game/heroes.json`,
      license: 'CC BY-SA 4.0 (Mobile Legends Wiki)',
      retrieved_at_utc: retrievedAt,
      records: 0,
      status: 'ok',
    },
    {
      name: 'MLBBDex mirror — skills',
      url: `${base}/src/data/game/skills.json`,
      license: 'CC BY-SA 4.0 (Mobile Legends Wiki)',
      retrieved_at_utc: retrievedAt,
      records: 0,
      status: 'ok',
    },
    {
      name: 'MLBBDex mirror — statistics',
      url: `${base}/src/data/game/statistics.json`,
      license: 'CC BY-SA 4.0 (Mobile Legends Wiki)',
      retrieved_at_utc: retrievedAt,
      records: 0,
      status: 'ok',
    },
    {
      name: 'MLBBDex mirror — items',
      url: `${base}/src/data/game/items.json`,
      license: 'CC BY-SA 4.0 (Mobile Legends Wiki)',
      retrieved_at_utc: retrievedAt,
      records: 0,
      status: 'ok',
    },
  ];
}

export function normalizeBundleToDataset(bundle: UpstreamBundle, upstreamBaseUrl: string): DatasetPayload {
  const retrievedAt = toIsoNow();
  const warnings: string[] = [];
  const measuredAt = pickMeasuredAt(bundle.statistics, bundle.sync);

  const heroesRaw = getHeroesArray(bundle.heroes);
  const skillsIndex = getSkillsIndex(bundle.skills);
  const visuals = getVisuals(bundle.visuals);
  const rankRates = pickRankRates(bundle.statistics);

  const heroes: Hero[] = [];
  const heroIds = new Set<string>();

  for (const rawHero of heroesRaw) {
    const id = toHeroId(rawHero.slug ?? rawHero.id);
    if (!id) continue;
    if (heroIds.has(id)) {
      addWarning(warnings, `duplicate-hero-id-dropped: ${id}`);
      continue;
    }

    const skills = normalizeSkillList(id, skillsIndex.get(id) ?? [], visuals.skills);
    if (skills.length === 0) {
      addWarning(warnings, `hero-no-skills: ${id}`);
    }

    const roleList = asArray(rawHero.roles).map((value) => toStr(value)).filter((value): value is string => Boolean(value));
    const laneList = asArray(rawHero.lanes).map((value) => toStr(value)).filter((value): value is string => Boolean(value));
    const speciality = asArray(rawHero.specialties ?? rawHero.speciality)
      .map((value) => toStr(value))
      .filter((value): value is string => Boolean(value));

    const hero: Hero = {
      id,
      name: toStr(rawHero.name) ?? id,
      roles: roleList,
      lanes: laneList,
      speciality,
      difficulty: toNum(rawHero.difficulty ?? asRecord(rawHero.ratings).difficulty),
      release_year: toNum(rawHero.year ?? rawHero.release_year),
      price: toNum(rawHero.price),
      portrait_url: resolvePortrait(visuals.heroes, id),
      icon_url: resolveHeroIcon(visuals.heroes, id),
      illustration_url: resolveIllustration(visuals.illustrations, id),
      title: toStr(rawHero.title),
      damage_type: normalizeDamage(rawHero.damageType ?? rawHero.damage_type),
      attack_type: toStr(rawHero.attackType ?? rawHero.attack_type),
      resource: normalizeResource(rawHero.resource),
      region: toStr(rawHero.region),
      ratings: normalizeRatings(rawHero.ratings),
      base_stats: normalizeBaseStats(rawHero.stats ?? rawHero.base_stats),
      skills,
      counters: [],
      weak_against: [],
      synergies: [],
      stats: normalizeHeroStats(
        rawHero,
        rankRates.rates.get(id),
        collectByRankRows(id, rankRates.byRank),
        measuredAt
      ),
    };

    heroIds.add(id);
    heroes.push(hero);
  }

  heroes.sort((a, b) => a.name.localeCompare(b.name));

  const countersRaw = getCounters(bundle.statistics);
  const relationsRaw = getRelations(bundle.statistics);
  const edges = buildEdges(heroIds, countersRaw, relationsRaw, warnings);
  const { countersByHero, weakByHero } = deriveCounterSets(edges);

  for (const hero of heroes) {
    hero.counters = [...(countersByHero.get(hero.id) ?? new Set())].sort();
    hero.weak_against = [...(weakByHero.get(hero.id) ?? new Set())].sort();

    const relation = asRecord(relationsRaw[hero.id]);
    hero.synergies = asArray(relation.synergies)
      .map((value) => toHeroId(value))
      .filter((value): value is string => typeof value === 'string' && heroIds.has(value));
  }

  const items = normalizeItems(bundle.items, visuals.items);

  const sources = buildSourceEntries(retrievedAt, upstreamBaseUrl);
  if (sources[0]) sources[0].records = heroes.length;
  if (sources[1]) sources[1].records = heroes.reduce((sum, hero) => sum + hero.skills.length, 0);
  if (sources[2]) sources[2].records = edges.length;
  if (sources[3]) sources[3].records = items.length;

  const ratesSummary = buildRatesSummary(heroes, measuredAt);
  const heroesWithoutRates = heroes.filter((h) => !h.stats || h.stats.win_rate === null);
  if (heroesWithoutRates.length > 0) {
    addWarning(
      warnings,
      `data-incomplete: no win/pick/ban rate for ${heroesWithoutRates.length} hero(s): ` +
        heroesWithoutRates.map((h) => h.id).join(', ')
    );
  }

  const manifest: Manifest = {
    schema_version: '1.0.0',
    generated_at_utc: retrievedAt,
    game_patch: pickPatch(bundle.sync),
    counts: {
      heroes: heroes.length,
      maps: 0,
      counter_edges: edges.length,
      items: items.length,
      rated_heroes: ratesSummary.rated_heroes,
    },
    rates_summary: ratesSummary,
    sources,
    warnings,
  };

  if (heroes.length < 120) {
    throw new Error(`Unexpected hero count: ${heroes.length}. Upstream may be incomplete.`);
  }

  return {
    manifest,
    heroes: { heroes },
    counters: {
      edges,
      generated_at_utc: retrievedAt,
    },
    items: { items },
    maps: { maps: [] },
  };
}
