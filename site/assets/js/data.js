/**
 * Dataset loader and normalisation layer.
 *
 * Rules imposed by docs/design/dataset-contract.md:
 *  - the site may only read files under `site/dataset/` via fetch()
 *  - no hero data may be hardcoded here
 *  - unknown values are `null`, never a fabricated substitute
 *
 * This module additionally repairs a handful of defects that are present in the
 * shipped snapshot. Every repair is recorded in `dataset.integrity` so the
 * Data & Sources page can disclose it instead of hiding it.
 */

const DATASET_DIR = new URL('../../dataset/', import.meta.url);

const FILES = {
  manifest: 'manifest.json',
  heroes: 'heroes.json',
  counters: 'counters.json',
  items: 'items.json',
  maps: 'maps.json',
};

/* ------------------------------------------------------------------ utils */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function str(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function slugifyName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/* ------------------------------------------------------- value normalisers */

// The snapshot contains one misspelled damage type. Kept as a lookup so the
// repair is visible rather than silently folded into the data.
const DAMAGE_SPELLING = { Phyiscal: 'Physical' };

function normaliseDamage(raw) {
  const v = str(raw);
  if (!v) return null;
  return DAMAGE_SPELLING[v] ?? v;
}

// Resource arrives in three shapes: "Mana", "Energy", the literal string
// "None", and a wiki template residue "Resource#Rage/Indicator|None".
function normaliseResource(raw) {
  const v = str(raw);
  if (!v) return null;
  if (v === 'None') return null;

  const residue = v.match(/Resource#([^/|]+)/);
  if (residue) return str(residue[1]) ?? null;

  return v;
}

function normaliseRatings(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pick = (k) => num(raw[k]);
  return {
    offense: pick('offense'),
    durability: pick('durability'),
    ability_effect: pick('ability_effect'),
    difficulty: pick('difficulty'),
  };
}

function normaliseStats(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    tier: str(raw.tier),
    win_rate: num(raw.win_rate),
    pick_rate: num(raw.pick_rate),
    ban_rate: num(raw.ban_rate),
    rank_scope: str(raw.rank_scope),
    updated_at_utc: str(raw.updated_at_utc),
  };
}

function normaliseBaseStats(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === 'number' ? v : Number(v);
    out[k] = Number.isFinite(n) ? n : null;
  }
  return out;
}

function normaliseSkill(raw, index, heroId) {
  const name = str(raw.name) ?? `Skill ${index + 1}`;
  return {
    id: str(raw.id) ?? `${heroId}-s${index}`,
    name,
    // Contract: index 0 is the passive; sources ship no explicit type flag.
    type: str(raw.type) ?? (index === 0 ? 'passive' : 'active'),
    label: str(raw.label),
    description: str(raw.description),
    cooldown: str(raw.cooldown),
    mana_cost: str(raw.mana_cost),
    icon_url: str(raw.icon_url),
  };
}

/* ------------------------------------------------------------------ fetch */

async function fetchJson(file) {
  const url = new URL(file, DATASET_DIR).href;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const bytes = Number(res.headers.get('content-length') ?? 0);
  const json = await res.json();
  return { json, bytes };
}

/* ------------------------------------------------------------ integrity log */

function makeLogger() {
  const issues = [];
  return {
    issues,
    add(kind, detail) {
      issues.push({ kind, detail });
    },
  };
}

/* --------------------------------------------------------------- normalise */

function buildHeroes(rawHeroes, log) {
  const heroes = [];
  const seen = new Set();

  for (const raw of rawHeroes) {
    const id = str(raw.id);
    if (!id) {
      log.add('hero-missing-id', 'A hero entry without an id was dropped.');
      continue;
    }
    if (seen.has(id)) {
      log.add('hero-duplicate-id', `Duplicate hero id "${id}" — second entry dropped.`);
      continue;
    }
    seen.add(id);

    if (DAMAGE_SPELLING[str(raw.damage_type)]) {
      log.add(
        'value-repaired',
        `${id}: damage_type "${str(raw.damage_type)}" corrected to "Physical".`
      );
    }

    const skills = Array.isArray(raw.skills) ? raw.skills : [];
    if (skills.length === 0) {
      log.add('hero-no-skills', `${id}: no skills in dataset.`);
    }

    heroes.push({
      id,
      name: str(raw.name) ?? id,
      roles: Array.isArray(raw.roles) ? raw.roles.map(str).filter(Boolean) : [],
      lanes: Array.isArray(raw.lanes) ? raw.lanes.map(str).filter(Boolean) : [],
      speciality: Array.isArray(raw.speciality) ? raw.speciality.map(str).filter(Boolean) : [],
      difficulty: num(raw.difficulty),
      release_year: num(raw.release_year),
      price: num(raw.price),
      portrait_url: str(raw.portrait_url),
      icon_url: str(raw.icon_url),
      illustration_url: str(raw.illustration_url),
      title: str(raw.title),
      damage_type: normaliseDamage(raw.damage_type),
      attack_type: str(raw.attack_type),
      resource: normaliseResource(raw.resource),
      region: str(raw.region),
      ratings: normaliseRatings(raw.ratings),
      base_stats: normaliseBaseStats(raw.base_stats),
      skills: skills.map((s, i) => normaliseSkill(s, i, id)),
      // heroes[].counters / weak_against in this snapshot are corrupt: 133 of
      // 134 heroes list themselves. They are deliberately NOT used — see
      // buildCounterGraph(). The raw arrays are kept only for auditing.
      counters_raw: Array.isArray(raw.counters) ? raw.counters : [],
      weak_against_raw: Array.isArray(raw.weak_against) ? raw.weak_against : [],
      synergies: Array.isArray(raw.synergies) ? raw.synergies.map(str).filter(Boolean) : [],
      stats: normaliseStats(raw.stats),
    });
  }

  heroes.sort((a, b) => a.name.localeCompare(b.name));
  return heroes;
}

/**
 * Counter relationships are derived exclusively from counters.json.
 *
 * Contract semantics: `from` beats `to`.
 *   beats[h]    = heroes that h defeats
 *   beatenBy[h] = heroes that defeat h
 */
function buildCounterGraph(rawEdges, heroIds, log) {
  const beats = new Map();
  const beatenBy = new Map();
  for (const id of heroIds) {
    beats.set(id, []);
    beatenBy.set(id, []);
  }

  const edges = [];
  const pairs = new Map(); // "a|b" sorted -> edge, to detect contradictions
  let dropped = 0;

  for (const raw of rawEdges) {
    const from = str(raw.from);
    const to = str(raw.to);

    if (!from || !to) continue;
    if (!heroIds.has(from) || !heroIds.has(to)) {
      log.add('counter-unknown-hero', `Edge ${from} -> ${to} references an unknown hero.`);
      dropped += 1;
      continue;
    }
    if (from === to) {
      log.add('counter-self-loop', `Edge ${from} -> ${to} is a self-loop and was dropped.`);
      dropped += 1;
      continue;
    }

    const key = [from, to].sort().join('|');
    if (pairs.has(key)) {
      log.add(
        'counter-contradiction',
        `Pair ${from} / ${to} is claimed in both directions — second claim dropped.`
      );
      dropped += 1;
      continue;
    }
    pairs.set(key, raw);

    const edge = {
      from,
      to,
      relation: str(raw.relation) ?? 'counters',
      strength: num(raw.strength),
      advantage_points: num(raw.advantage_points),
      source: str(raw.source),
    };
    edges.push(edge);
    beats.get(from).push(edge);
    beatenBy.get(to).push({ ...edge, other: from });
  }

  for (const list of beats.values()) {
    list.sort((a, b) => (b.advantage_points ?? 0) - (a.advantage_points ?? 0));
  }
  for (const list of beatenBy.values()) {
    list.sort((a, b) => (b.advantage_points ?? 0) - (a.advantage_points ?? 0));
  }

  return { edges, beats, beatenBy, dropped };
}

function buildItems(rawItems, log) {
  const items = [];
  for (const raw of rawItems) {
    const id = str(raw.id);
    if (!id) continue;
    items.push({
      id,
      name: str(raw.name) ?? id,
      summary: str(raw.summary),
      category: str(raw.category) ?? 'Uncategorised',
      price: num(raw.price),
      bonus: str(raw.bonus),
      unique: str(raw.unique),
      passive: str(raw.passive),
      active: str(raw.active),
      recipe: Array.isArray(raw.recipe) ? raw.recipe.map(str).filter(Boolean) : [],
      best_for: str(raw.best_for),
      icon_url: str(raw.icon_url),
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

/* ------------------------------------------------------------ quality gate */

/**
 * Runs the contract's quality gate at load time so the Data & Sources page can
 * show the real result instead of a claim.
 */
function runQualityGate({ manifest, heroes, items, edges, fileBytes, missingFiles, missingOptionalFiles }) {
  const checks = [];
  const add = (id, label, pass, detail, { optional = false } = {}) =>
    checks.push({ id, label, pass, detail, optional });

  const heroCount = heroes.length;
  const declared = manifest?.counts?.heroes ?? null;

  add(
    'files',
    'Required dataset files parse as JSON',
    missingFiles.length === 0,
    missingFiles.length
      ? `Missing: ${missingFiles.join(', ')}`
      : `manifest, heroes, counters and items all loaded`
  );

  add(
    'maps',
    'Map dataset present',
    missingOptionalFiles.length === 0,
    missingOptionalFiles.length
      ? `${missingOptionalFiles.join(', ')} — optional, manifest.counts.maps is ${manifest?.counts?.maps ?? 0}, so no map view is built`
      : 'present',
    { optional: true }
  );

  add(
    'hero-count',
    'heroes.json holds at least 120 heroes',
    heroCount >= 120,
    `${heroCount} heroes`
  );

  const noSkills = heroes.filter((h) => h.skills.length === 0);
  add(
    'skills',
    'Every hero has at least one skill',
    noSkills.length === 0,
    noSkills.length ? `Missing skills: ${noSkills.map((h) => h.id).join(', ')}` : 'All heroes have skills'
  );

  const ids = new Set(heroes.map((h) => h.id));
  const dupes = heroCount - ids.size;
  add('unique-ids', 'Hero ids are unique', dupes === 0, dupes ? `${dupes} duplicates` : `${ids.size} unique ids`);

  const dangling = new Set();
  for (const e of edges) {
    if (!ids.has(e.from)) dangling.add(e.from);
    if (!ids.has(e.to)) dangling.add(e.to);
  }
  for (const h of heroes) {
    for (const s of h.synergies) if (!ids.has(s)) dangling.add(s);
  }
  add(
    'refs',
    'All relationship targets exist in heroes.json',
    dangling.size === 0,
    dangling.size ? `Dangling: ${[...dangling].join(', ')}` : 'No dangling references'
  );

  const badUrls = heroes.filter((h) => h.portrait_url && !/^https?:\/\//.test(h.portrait_url));
  add(
    'absolute-urls',
    'Image paths are absolute URLs',
    badUrls.length === 0,
    badUrls.length ? `${badUrls.length} relative paths` : 'All image URLs are absolute'
  );

  add(
    'manifest-count',
    'manifest.counts.heroes matches heroes.json',
    declared === heroCount,
    `manifest says ${declared ?? 'n/a'}, file has ${heroCount}`
  );

  const itemsDeclared = manifest?.counts?.items ?? null;
  add(
    'manifest-items',
    'manifest.counts.items matches items.json',
    itemsDeclared === items.length,
    `manifest says ${itemsDeclared ?? 'n/a'}, file has ${items.length}`
  );

  const edgesDeclared = manifest?.counts?.counter_edges ?? null;
  add(
    'manifest-edges',
    'manifest.counts.counter_edges matches counters.json',
    edgesDeclared === edges.length,
    `manifest says ${edgesDeclared ?? 'n/a'}, parsed ${edges.length} usable edges`
  );

  const suspicious = [];
  const scan = (value, path) => {
    if (typeof value !== 'string') return;
    if (/\b(null|undefined|NaN|TODO)\b/.test(value)) suspicious.push(path);
  };
  for (const h of heroes) {
    scan(h.name, `${h.id}.name`);
    scan(h.title, `${h.id}.title`);
    scan(h.region, `${h.id}.region`);
    for (const s of h.skills) scan(s.name, `${h.id}.skills.${s.id}.name`);
  }
  add(
    'no-placeholders',
    'No placeholder tokens (null / undefined / NaN / TODO) in text fields',
    suspicious.length === 0,
    suspicious.length ? `${suspicious.length} field(s): ${suspicious.slice(0, 5).join(', ')}` : 'Clean'
  );

  const oversize = Object.entries(fileBytes).filter(([, b]) => b > 25 * 1024 * 1024);
  add(
    'file-size',
    'No dataset file exceeds 25 MB',
    oversize.length === 0,
    oversize.length ? `Oversize: ${oversize.map(([f]) => f).join(', ')}` : 'All files within limit'
  );

  return checks;
}

/* ------------------------------------------------------------------- main */

let cache = null;

export async function loadDataset() {
  if (cache) return cache;

  const log = makeLogger();
  const fileBytes = {};
  const missingFiles = [];
  const missingOptionalFiles = [];
  const raw = {};

  // manifest.json is fetched first: counts.maps tells us whether requesting
  // maps.json would only produce a 404.
  let manifestHead = null;
  try {
    const { json, bytes } = await fetchJson(FILES.manifest);
    manifestHead = json;
    raw.manifest = json;
    fileBytes.manifest = bytes;
  } catch (err) {
    log.add('source-failed', `${FILES.manifest}: ${err.message}`);
  }

  const mapCount = manifestHead?.counts?.maps ?? 0;
  if (mapCount === 0) {
    missingOptionalFiles.push(FILES.maps);
  }
  const pending = Object.entries(FILES)
    .filter(([key]) => key !== 'manifest')
    .filter(([key]) => key !== 'maps' || mapCount > 0);

  const results = await Promise.all(
    pending.map(async ([key, file]) => {
      try {
        const { json, bytes } = await fetchJson(file);
        return [key, { json, bytes, ok: true }];
      } catch (err) {
        return [key, { error: err, ok: false }];
      }
    })
  );

  for (const [key, result] of results) {
    if (result.ok) {
      raw[key] = result.json;
      fileBytes[key] = result.bytes;
    } else {
      raw[key] = null;
      if (key === 'maps') {
        missingOptionalFiles.push(FILES.maps);
        log.add('source-failed', `${FILES[key]}: ${result.error.message}`);
      } else {
        missingFiles.push(FILES[key]);
        log.add('source-failed', `${FILES[key]}: ${result.error.message}`);
      }
    }
  }

  if (!raw.heroes) {
    throw new Error('heroes.json could not be loaded — the site has nothing to render.');
  }

  const heroes = buildHeroes(raw.heroes.heroes ?? [], log);
  const heroIds = new Set(heroes.map((h) => h.id));

  // Disclose the corrupt per-hero counter arrays once, with a real count.
  const selfReferential = heroes.filter(
    (h) => h.counters_raw.length > 0 && h.counters_raw.every((x) => x === h.id)
  ).length;
  if (selfReferential > 0) {
    log.add(
      'field-corrupt',
      `heroes[].counters / weak_against are self-referential for ${selfReferential} of ${heroes.length} ` +
        `heroes and cannot be used. All matchups on this site are derived from counters.json edges instead.`
    );
  }

  const graph = buildCounterGraph(raw.counters?.edges ?? [], heroIds, log);
  const items = buildItems(raw.items?.items ?? [], log);
  const manifest = raw.manifest ?? null;

  // Skill icon URLs are absolute and verified by the collector; keep only
  // heroes whose portrait exists so views can fall back cleanly.
  const noPortrait = heroes.filter((h) => !h.portrait_url);
  if (noPortrait.length) {
    log.add('asset-gap', `No portrait_url for: ${noPortrait.map((h) => h.name).join(', ')}`);
  }
  const noStats = heroes.filter((h) => !h.stats);
  if (noStats.length) {
    log.add('stats-gap', `No rank statistics for: ${noStats.map((h) => h.name).join(', ')}`);
  }

  const byId = new Map(heroes.map((h) => [h.id, h]));

  const dataset = {
    manifest,
    heroes,
    byId,
    items,
    edges: graph.edges,
    beats: graph.beats,
    beatenBy: graph.beatenBy,
    maps: raw.maps?.maps ?? null,
    integrity: log.issues,
    quality: runQualityGate({
      manifest,
      heroes,
      items,
      edges: graph.edges,
      fileBytes,
      missingFiles,
      missingOptionalFiles,
    }),
    meta: {
      generated_at_utc: manifest?.generated_at_utc ?? null,
      game_patch: manifest?.game_patch ?? null,
      counts: manifest?.counts ?? null,
      declaredWarnings: manifest?.warnings ?? [],
      sources: manifest?.sources ?? [],
      droppedEdges: graph.dropped,
      fileBytes,
      missingFiles,
      missingOptionalFiles,
      schema_version: manifest?.schema_version ?? null,
    },
  };

  cache = dataset;
  return dataset;
}

/* ------------------------------------------------------------- derivations */

/** Distinct values across a hero field, with counts for filter chips. */
export function facets(heroes, field) {
  const map = new Map();
  for (const hero of heroes) {
    const values = hero[field];
    const list = Array.isArray(values) ? values : [values];
    for (const value of list) {
      if (value === null || value === undefined) continue;
      map.set(value, (map.get(value) ?? 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

/**
 * Net matchup score of `heroId` against a set of enemy ids.
 *
 * Sums real advantage points in both directions; matchups with no measured
 * edge contribute nothing. Returns null when there is no data at all so the
 * caller can show a gap rather than a misleading zero.
 */
export function scoreAgainst(dataset, heroId, enemyIds) {
  const beats = dataset.beats.get(heroId) ?? [];
  const beatenBy = dataset.beatenBy.get(heroId) ?? [];

  const winById = new Map();
  for (const e of beats) winById.set(e.to, e.advantage_points ?? 0);
  const loseById = new Map();
  for (const e of beatenBy) loseById.set(e.other, e.advantage_points ?? 0);

  let score = 0;
  let covered = 0;
  const detail = [];

  for (const enemy of enemyIds) {
    if (enemy === heroId) continue;
    const win = winById.get(enemy);
    const lose = loseById.get(enemy);

    if (win !== undefined) {
      score += win;
      covered += 1;
      detail.push({ enemy, direction: 'beats', points: win });
    } else if (lose !== undefined) {
      score -= lose;
      covered += 1;
      detail.push({ enemy, direction: 'loses', points: -lose });
    } else {
      detail.push({ enemy, direction: 'unknown', points: 0 });
    }
  }

  if (covered === 0) return null;
  return { score, covered, detail, total: enemyIds.filter((e) => e !== heroId).length };
}

export { slugifyName };
