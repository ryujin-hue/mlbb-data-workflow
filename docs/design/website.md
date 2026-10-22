# Website — MLBB Meta Center

Static front-end that turns `site/dataset/*.json` into a browsable hero, counter
and item reference. This document describes how it is built and, more
importantly, what it refuses to invent.

## Design constraints

Everything below is fixed by [`dataset-contract.md`](./dataset-contract.md):

| Constraint | How it is met |
|---|---|
| Website may only read `site/dataset/` via `fetch()` | `assets/js/data.js` resolves every path against `new URL('../../dataset/', import.meta.url)`; nothing is fetched from anywhere else |
| No hardcoded hero data | Every hero, counter edge and item comes from the JSON files |
| No build step, no npm dependency | Plain HTML + CSS + ES modules, served as-is |
| Missing value = `null`, never invented | Normalisers return `null`; views render an em dash |
| Deployable to Cloudflare Pages with empty build command | Output directory is `site/` |

## Layout

```
site/
├── index.html               shell: topbar, #view outlet, footer
├── dataset/                 collector output (do not hand-edit)
└── assets/
    ├── css/app.css          design tokens + every component style
    └── js/
        ├── main.js          boot, route table, chrome updates
        ├── data.js          fetch, normalise, derive counter graph, quality gate
        ├── router.js        hash router with silent query sync
        ├── dom.js           element helper; textContent only, never innerHTML
        ├── format.js        number/date formatting with honest fallbacks
        ├── components.js    hero card, matchup row, rating bar, table
        └── views/           heroes, hero, counters, items, sources
```

`dom.js` never assigns `innerHTML`. Skill descriptions and hero titles come from
a third-party wiki dump, so they are inserted as text nodes.

## Running it locally

ES modules cannot be loaded over `file://`, so serve the directory:

```bash
cd site
python3 -m http.server 5173
# → http://localhost:5173
```

Any static server works. There is nothing to install.

## Views

- **Heroes** — full roster, filterable by role / lane / damage type / tier,
  sortable by win rate, ban rate, pick rate, tier, difficulty or release year.
  Filters are written to the URL (`#/heroes?role=Tank`) so any view is shareable.
- **Hero detail** — ratings, level-1/15 base statistics, the hero's full skill
  list, and measured matchups in both directions.
- **Counter Lab** — add up to five enemy heroes; every remaining hero is scored
  by summing measured advantage points. Also lists the worst into the line-up.
- **Items** — 102 equipment entries with bonuses, unique effects and recipes.
- **Data & Sources** — provenance, the quality gate, collector warnings, and the
  defects detected while loading.

## How matchups are derived

`heroes[].counters` and `heroes[].weak_against` are **not used**. In this
snapshot 133 of 134 heroes list *themselves* in both arrays, which makes the
fields unusable.

All matchups come from `counters.json` edges, where `from` beats `to`:

```
beats[h]    = edges where from == h
beatenBy[h] = edges where to   == h
```

Edges are validated on load: self-loops, unknown hero ids and pairs claimed in
both directions are dropped and recorded as warnings. The verified snapshot has
zero contradictory pairs.

### Counter Lab scoring

For a candidate hero against a line-up of enemies:

```
score = Σ advantage_points where the candidate beats an enemy
      − Σ advantage_points where an enemy beats the candidate
```

Matchups with no edge contribute nothing. If no enemy has a measured matchup the
candidate is omitted instead of being shown with a zero that implies evidence
that does not exist. The "Hit" column shows how many enemies are actually
covered, so a high score over `1/5` coverage is not mistaken for a full read.

## Known data defects

Handled at load time and disclosed on the Data & Sources page:

| Defect | Handling |
|---|---|
| `counters` / `weak_against` self-referential for 133/134 heroes | Ignored; matchups rebuilt from `counters.json` |
| `damage_type: "Phyiscal"` (1 hero) | Corrected to `Physical`, repair logged |
| `resource: "Resource#Rage/Indicator|None"` (19 heroes) | Normalised to `Rage` |
| `resource: "None"` (21 heroes) | Normalised to `null`, shown as an explicit absence |
| `difficulty: null` (Nana) | Rendered as em dash |
| `price: null` for every hero | Field not displayed rather than shown as 0 |
| Dori has no portrait, stats or matchups | Page renders with explicit gaps |
| No `maps.json` in this snapshot | No map view is built; `manifest.counts.maps` is 0 so the request is not even made |

Skill counts are not assumed to be four: Beatrix ships 20 abilities, and the
detail view renders whatever the file contains. `Ultimate` is only labelled when
a hero has exactly four skills, because the source does not identify which skill
is the ultimate for the multi-stance heroes.

## Attribution

Hero, skill, counter and item data derive from the MLBBDex dataset mirror
(`achedon12/mlbb`), which carries Mobile Legends Wiki content under
CC BY-SA 4.0. See [`source_attribution.md`](../../source_attribution.md).
Not affiliated with Moonton.