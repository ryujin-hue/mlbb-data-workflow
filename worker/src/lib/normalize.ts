import { clamp, toIsoNow } from './time';
import type {
  CounterEdge,
  DatasetPayload,
  Hero,
  HeroSkill,
  HeroStats,
  Item,
  Manifest,
  SourceEntry,
} from '../types';
import type { UpstreamBundle } from './fetch-upstream';

const ASSET_BASE = 'https://raw.githubusercontent.com/achedon12/mlbb/develop/public/';
const RANK_PRIORITY = ['all', 'epic', 'legend', 'mythic', 'honor', 'glory'] as const;

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

function normalizeHeroStats(rawHero: Record<string, unknown>, measuredAt: string | null): HeroStats | null {
  const stats = asRecord(rawHero.stats);
  if (Object.keys(stats).length === 0) {
    return null;
  }

  const updatedAt = toStr(stats.updated_at_utc) ?? toStr(stats.updatedAt) ?? measuredAt;

  return {
    tier: toStr(stats.tier),
    win_rate: toNum(stats.win_rate ?? stats.winRate),
    pick_rate: toNum(stats.pick_rate ?? stats.pickRate),
    ban_rate: toNum(stats.ban_rate ?? stats.banRate),
    rank_scope: toStr(stats.rank_scope) ?? 'All',
    updated_at_utc: updatedAt,
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
    const iconHint = asRecord(visualsItems[id]);

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
      icon_url: toAbsoluteAssetUrl(toStr(item.icon_url ?? item.icon ?? iconHint.url ?? iconHint.path)),
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
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
      stats: normalizeHeroStats(rawHero, measuredAt),
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

  const manifest: Manifest = {
    schema_version: '1.0.0',
    generated_at_utc: retrievedAt,
    game_patch: pickPatch(bundle.sync),
    counts: {
      heroes: heroes.length,
      maps: 0,
      counter_edges: edges.length,
      items: items.length,
    },
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
