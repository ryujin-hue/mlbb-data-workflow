/** Hero library: filterable, sortable roster with a meta overview strip. */

import { el, clear, append } from '../dom.js';
import { facets } from '../data.js';
import { heroCard, chip } from '../components.js';
import { percent, DASH, pluralise } from '../format.js';

const TIER_ORDER = { 'S+': 5, S: 4, A: 3, B: 2, C: 1 };

const SORTS = {
  name: { label: 'Name (A–Z)', fn: (a, b) => a.name.localeCompare(b.name) },
  win: {
    label: 'Win rate (high → low)',
    fn: (a, b) => (b.stats?.win_rate ?? -Infinity) - (a.stats?.win_rate ?? -Infinity),
  },
  ban: {
    label: 'Ban rate (high → low)',
    fn: (a, b) => (b.stats?.ban_rate ?? -Infinity) - (a.stats?.ban_rate ?? -Infinity),
  },
  pick: {
    label: 'Pick rate (high → low)',
    fn: (a, b) => (b.stats?.pick_rate ?? -Infinity) - (a.stats?.pick_rate ?? -Infinity),
  },
  tier: {
    label: 'Tier (S+ → C)',
    fn: (a, b) =>
      (TIER_ORDER[b.stats?.tier] ?? -1) - (TIER_ORDER[a.stats?.tier] ?? -1) ||
      (b.stats?.win_rate ?? -Infinity) - (a.stats?.win_rate ?? -Infinity),
  },
  difficulty: {
    label: 'Difficulty (easy → hard)',
    fn: (a, b) => (a.difficulty ?? 99) - (b.difficulty ?? 99),
  },
  release: {
    label: 'Release year (newest first)',
    fn: (a, b) => (b.release_year ?? 0) - (a.release_year ?? 0),
  },
};

const decodeList = (value) => new Set(value ? value.split(',').filter(Boolean) : []);
const encodeList = (set) => [...set].sort().join(',');

export function createHeroesView(dataset, router) {
  const state = {
    roles: new Set(),
    lanes: new Set(),
    dmg: new Set(),
    tiers: new Set(),
    sort: 'win',
    q: '',
  };

  const roleFacets = facets(dataset.heroes, 'roles');
  const laneFacets = facets(dataset.heroes, 'lanes');
  const dmgFacets = facets(dataset.heroes, 'damage_type');
  const tierFacets = facets(dataset.heroes.map((h) => ({ tier: h.stats?.tier })), 'tier')
    .filter(([t]) => Boolean(t))
    .sort((a, b) => (TIER_ORDER[b[0]] ?? 0) - (TIER_ORDER[a[0]] ?? 0));

  // Stable containers — filters re-fill them instead of swapping nodes, so
  // scroll position and focus are preserved.
  let countNode = null;
  let chipsWrap = null;
  let gridWrap = null;

  function syncUrl() {
    const q = new URLSearchParams();
    if (state.roles.size) q.set('role', encodeList(state.roles));
    if (state.lanes.size) q.set('lane', encodeList(state.lanes));
    if (state.dmg.size) q.set('dmg', encodeList(state.dmg));
    if (state.tiers.size) q.set('tier', encodeList(state.tiers));
    if (state.sort !== 'win') q.set('sort', state.sort);
    if (state.q) q.set('q', state.q);
    router.updateQuery(q);
  }

  function applyQuery(query) {
    state.roles = decodeList(query.get('role'));
    state.lanes = decodeList(query.get('lane'));
    state.dmg = decodeList(query.get('dmg'));
    state.tiers = decodeList(query.get('tier'));
    state.sort = SORTS[query.get('sort')] ? query.get('sort') : 'win';
    state.q = query.get('q') ?? '';
  }

  function matches(hero) {
    if (state.roles.size && !hero.roles.some((r) => state.roles.has(r))) return false;
    if (state.lanes.size && !hero.lanes.some((l) => state.lanes.has(l))) return false;
    if (state.dmg.size && !state.dmg.has(hero.damage_type)) return false;
    if (state.tiers.size && !state.tiers.has(hero.stats?.tier)) return false;

    const needle = state.q.trim().toLowerCase();
    if (needle) {
      const haystack = [hero.name, hero.id, hero.title ?? '', ...hero.roles, ...hero.lanes, ...hero.speciality]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }

  function visible() {
    const list = dataset.heroes.filter(matches);
    list.sort(SORTS[state.sort].fn);
    return list;
  }

  function renderGrid() {
    const list = visible();
    countNode.textContent = `${list.length} of ${dataset.heroes.length} heroes`;

    clear(gridWrap);
    if (list.length === 0) {
      append(gridWrap, el('div', {
        class: 'empty',
        text: 'No hero matches every active filter. Clear a filter or change the search term.',
      }));
      return;
    }
    append(gridWrap, el('div', { class: 'hero-grid' }, list.map(heroCard)));
  }

  function filterRow(label, entries, set) {
    return el(
      'div',
      { class: 'controls__row' },
      el('span', { class: 'controls__label', text: label }),
      el('div', { class: 'chips' }, entries.map(([value, n]) =>
        chip({
          label: value,
          count: n,
          active: set.has(value),
          onToggle: () => {
            if (set.has(value)) set.delete(value);
            else set.add(value);
            syncUrl();
            renderChips();
            renderGrid();
          },
        })
      ))
    );
  }

  function renderChips() {
    clear(chipsWrap);
    append(chipsWrap,
      filterRow('Role', roleFacets, state.roles),
      filterRow('Lane', laneFacets, state.lanes),
      filterRow('Damage', dmgFacets, state.dmg),
      filterRow('Tier', tierFacets, state.tiers)
    );
  }

  function buildStatStrip() {
    const rated = dataset.heroes.filter((h) => Number.isFinite(h.stats?.win_rate));
    const avgWin = rated.length
      ? rated.reduce((s, h) => s + h.stats.win_rate, 0) / rated.length
      : null;
    const topBan = [...dataset.heroes]
      .filter((h) => Number.isFinite(h.stats?.ban_rate))
      .sort((a, b) => b.stats.ban_rate - a.stats.ban_rate)[0];

    const cell = (label, value, sub) => el(
      'div',
      { class: 'statstrip__cell' },
      el('div', { class: 'statstrip__label', text: label }),
      el('div', { class: 'statstrip__value', text: value }),
      sub ? el('div', { class: 'statstrip__sub', text: sub }) : null
    );

    return el(
      'div',
      { class: 'statstrip' },
      cell('Heroes', String(dataset.heroes.length), pluralise(dataset.edges.length, 'counter edge')),
      cell('Items', String(dataset.items.length), 'equipment entries'),
      cell('Avg win rate', percent(avgWin), `${rated.length} heroes rated`),
      cell('Most banned', topBan ? topBan.name : DASH, topBan ? percent(topBan.stats.ban_rate) : 'no ban data'),
      cell('Snapshot', dataset.meta.generated_at_utc ? dataset.meta.generated_at_utc.slice(0, 10) : DASH, 'UTC')
    );
  }

  function build(query) {
    applyQuery(query);

    countNode = el('span', { class: 'count-note', text: '' });

    const head = el(
      'div',
      { class: 'page-head' },
      el('div', { class: 'page-head__row' }, el('h1', { text: 'Hero roster' }), countNode),
      el('p', {
        class: 'lede',
        text:
          'Every hero in the dataset with its measured rank statistics. Win, pick and ban rates come from the ' +
          'MLBBDex statistics snapshot and cover all ranks combined. Sort by win rate to read the current meta, ' +
          'or open a hero to see its matchups.',
      })
    );

    const searchInput = el('input', {
      type: 'search',
      placeholder: 'Search name, title, tag…',
      value: state.q,
      'aria-label': 'Search heroes',
    });
    let debounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.q = searchInput.value;
        syncUrl();
        renderGrid();
      }, 140);
    });

    const sortSelect = el('select', { class: 'select', 'aria-label': 'Sort heroes' },
      Object.entries(SORTS).map(([key, def]) => el('option', {
        value: key,
        text: def.label,
        selected: key === state.sort,
      })));
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      syncUrl();
      renderGrid();
    });

    const resetBtn = el('button', {
      type: 'button',
      class: 'btn btn--ghost',
      text: 'Reset',
      onClick: () => {
        state.roles.clear();
        state.lanes.clear();
        state.dmg.clear();
        state.tiers.clear();
        state.q = '';
        state.sort = 'win';
        searchInput.value = '';
        sortSelect.value = 'win';
        syncUrl();
        renderChips();
        renderGrid();
      },
    });

    chipsWrap = el('div', { class: 'chips-host' });
    gridWrap = el('div', {});

    const controls = el(
      'div',
      { class: 'controls' },
      chipsWrap,
      el(
        'div',
        { class: 'controls__row' },
        el('span', { class: 'controls__label', text: 'Sort' }),
        sortSelect,
        el('div', { class: 'search' }, searchInput),
        resetBtn
      )
    );

    const root = el('div', {}, head, buildStatStrip(), controls, gridWrap);
    renderChips();
    renderGrid();
    return root;
  }

  return function render(params, query) {
    void params;
    return build(query);
  };
}
