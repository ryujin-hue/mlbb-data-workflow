/** Item library: 102 equipment entries with recipe, passive and cost. */

import { el, clear, append, img } from '../dom.js';
import { chip } from '../components.js';
import { integer, DASH } from '../format.js';

const SORTS = {
  name: { label: 'Name (A–Z)', fn: (a, b) => a.name.localeCompare(b.name) },
  price: { label: 'Cost (low → high)', fn: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) },
  price_desc: { label: 'Cost (high → low)', fn: (a, b) => (b.price ?? -Infinity) - (a.price ?? Infinity) },
  category: {
    label: 'Category',
    fn: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  },
};

function categoryCounts(items) {
  const map = new Map();
  for (const item of items) map.set(item.category, (map.get(item.category) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function itemCard(item) {
  return el('div', { class: 'item-card' },
    item.icon_url
      ? img(item.icon_url, item.name, { cls: 'item-card__icon', width: 46, height: 46, fit: 'contain' })
      : el('div', { class: 'item-card__icon item-card__icon--empty', text: '—' }),
    el('div', {},
      el('div', { class: 'item-card__name', text: item.name }),
      el('div', { class: 'item-card__cat', text: item.category }),
      el('div', { class: 'item-card__price', text: item.price === null ? DASH : `${integer(item.price)} gold` }),
      item.bonus ? el('p', { class: 'item-card__bonus', text: item.bonus }) : null,
      item.unique ? el('p', { class: 'item-card__passive', text: `Unique: ${item.unique}` }) : null,
      item.passive ? el('p', { class: 'item-card__passive', text: item.passive }) : null,
      item.active ? el('p', { class: 'item-card__passive', text: `Active: ${item.active}` }) : null,
      item.recipe.length
        ? el('p', { class: 'item-card__recipe', text: `Recipe: ${item.recipe.join(' + ')}` })
        : null
    )
  );
}

export function createItemsView(dataset, router) {
  const cats = new Set();
  let sort = 'category';
  let q = '';
  let gridWrap = null;
  let countNode = null;
  let chipsWrap = null;

  function syncUrl() {
    const params = new URLSearchParams();
    if (cats.size) params.set('cat', [...cats].sort().join(','));
    if (sort !== 'category') params.set('sort', sort);
    if (q) params.set('q', q);
    router.updateQuery(params);
  }

  function visible() {
    return dataset.items
      .filter((item) => {
        if (cats.size && !cats.has(item.category)) return false;
        const needle = q.trim().toLowerCase();
        if (!needle) return true;
        return [item.name, item.category, item.bonus, item.passive, item.active, item.summary]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort(SORTS[sort].fn);
  }

  function renderGrid() {
    const list = visible();
    countNode.textContent = `${list.length} of ${dataset.items.length} items`;
    clear(gridWrap);
    if (!list.length) {
      append(gridWrap, el('div', { class: 'empty', text: 'No item matches the current filter.' }));
      return;
    }
    append(gridWrap, el('div', { class: 'item-grid' }, list.map(itemCard)));
  }

  function renderChips() {
    clear(chipsWrap);
    append(chipsWrap, el('div', { class: 'controls__row' },
      el('span', { class: 'controls__label', text: 'Category' }),
      el('div', { class: 'chips' }, categoryCounts(dataset.items).map(([value, n]) =>
        chip({
          label: value,
          count: n,
          active: cats.has(value),
          onToggle: () => {
            if (cats.has(value)) cats.delete(value);
            else cats.add(value);
            syncUrl();
            renderChips();
            renderGrid();
          },
        })
      ))
    ));
  }

  function build(query) {
    const rawCats = query.get('cat');
    cats.clear();
    if (rawCats) for (const c of rawCats.split(',')) if (c) cats.add(c);
    sort = SORTS[query.get('sort')] ? query.get('sort') : 'category';
    q = query.get('q') ?? '';

    countNode = el('span', { class: 'count-note', text: '' });

    const head = el('div', { class: 'page-head' },
      el('div', { class: 'page-head__row' }, el('h1', { text: 'Items' }), countNode),
      el('p', {
        class: 'lede',
        text:
          'The equipment table from the source dataset, with bonuses, unique effects and build recipes. ' +
          'Costs are gold values as published by the source — they are not adjusted per patch by this site.',
      })
    );

    const searchInput = el('input', {
      type: 'search',
      placeholder: 'Search name, bonus, effect…',
      value: q,
      'aria-label': 'Search items',
    });
    let debounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        q = searchInput.value;
        syncUrl();
        renderGrid();
      }, 140);
    });

    const sortSelect = el('select', { class: 'select', 'aria-label': 'Sort items' },
      Object.entries(SORTS).map(([key, def]) => el('option', {
        value: key, text: def.label, selected: key === sort,
      })));
    sortSelect.addEventListener('change', () => {
      sort = sortSelect.value;
      syncUrl();
      renderGrid();
    });

    chipsWrap = el('div', {});
    gridWrap = el('div', {});

    const controls = el('div', { class: 'controls' },
      chipsWrap,
      el('div', { class: 'controls__row' },
        el('span', { class: 'controls__label', text: 'Sort' }),
        sortSelect,
        el('div', { class: 'search' }, searchInput),
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: 'Reset',
          onClick: () => {
            cats.clear();
            sort = 'category';
            q = '';
            searchInput.value = '';
            sortSelect.value = 'category';
            syncUrl();
            renderChips();
            renderGrid();
          },
        })
      )
    );

    const root = el('div', { class: 'stack' }, head, controls, gridWrap);
    renderChips();
    renderGrid();
    return root;
  }

  return function render(params, query) {
    void params;
    return build(query);
  };
}
