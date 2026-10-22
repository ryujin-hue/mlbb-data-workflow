/**
 * Counter Lab.
 *
 * Picks heroes that answer a given enemy line-up. The score is the plain sum
 * of measured advantage points from counters.json: positive when the candidate
 * defeats an enemy, negative when an enemy defeats it. Matchups with no edge
 * contribute nothing and are reported as gaps rather than assumed neutral.
 */

import { el, clear, append, img } from '../dom.js';
import { scoreAgainst } from '../data.js';
import { percent, signed, DASH } from '../format.js';

const MAX_SLOTS = 5;

function suggestionRow(hero, onPick) {
  return el(
    'button',
    { type: 'button', class: 'suggest__item', onClick: () => onPick(hero) },
    el('div', { class: 'suggest__art' }, img(hero.portrait_url, hero.name, { width: 26, height: 34 })),
    el('span', {},
      el('span', { text: hero.name }),
      el('span', { class: 'slot__role', text: hero.roles.join(' / ') || DASH })
    )
  );
}

export function createCountersView(dataset, router) {
  let slots = [];
  let input = null;
  let suggestBox = null;
  let slotsBox = null;
  let resultsBox = null;
  let countNode = null;
  let cursor = 0;
  let filterText = '';

  function syncUrl() {
    const q = new URLSearchParams();
    if (slots.length) q.set('vs', slots.join(','));
    router.updateQuery(q);
  }

  function suggestions() {
    const needle = filterText.trim().toLowerCase();
    const taken = new Set(slots);
    return dataset.heroes
      .filter((h) => !taken.has(h.id))
      .filter((h) => !needle || h.name.toLowerCase().includes(needle) || h.id.includes(needle))
      .slice(0, 40);
  }

  function renderSuggest() {
    const list = suggestions();
    if (cursor >= list.length) cursor = Math.max(0, list.length - 1);

    clear(suggestBox);
    if (!list.length) {
      append(suggestBox, el('div', {
        class: 'suggest__empty',
        text: slots.length >= MAX_SLOTS ? 'Line-up full — remove a hero first.' : 'No hero matches that text.',
      }));
      return;
    }

    append(suggestBox, el('div', {}, list.map((hero, i) => {
      const row = suggestionRow(hero, add);
      if (i === cursor) row.classList.add('is-cursor');
      return row;
    })));
  }

  function renderSlots() {
    if (countNode) countNode.textContent = `${slots.length} / ${MAX_SLOTS}`;
    clear(slotsBox);
    if (!slots.length) {
      append(slotsBox, el('p', {
        class: 'note',
        text: 'No enemy selected. Search above and add up to five heroes.',
      }));
      return;
    }
    append(slotsBox, el('div', { class: 'slots' }, slots.map((id) => {
      const hero = dataset.byId.get(id);
      if (!hero) return null;
      return el('div', { class: 'slot' },
        el('div', { class: 'slot__art' }, img(hero.portrait_url, hero.name, { width: 30, height: 38 })),
        el('div', { class: 'slot__name' },
          el('span', { text: hero.name }),
          el('span', { class: 'slot__role', text: hero.roles.join(' / ') || DASH })
        ),
        el('button', {
          type: 'button',
          class: 'slot__x',
          text: '×',
          'aria-label': `Remove ${hero.name}`,
          onClick: () => remove(id),
        })
      );
    })));
  }

  function add(hero) {
    if (slots.length >= MAX_SLOTS) return;
    if (slots.includes(hero.id)) return;
    slots.push(hero.id);
    filterText = '';
    if (input) input.value = '';
    cursor = 0;
    syncUrl();
    renderSuggest();
    renderSlots();
    renderResults();
  }

  function remove(id) {
    slots = slots.filter((s) => s !== id);
    syncUrl();
    renderSuggest();
    renderSlots();
    renderResults();
  }

  function candidateRows() {
    const rows = [];
    for (const hero of dataset.heroes) {
      if (slots.includes(hero.id)) continue;
      const result = scoreAgainst(dataset, hero.id, slots);
      if (!result) continue; // no measured matchup against any of them
      rows.push({ hero, result });
    }
    rows.sort((a, b) =>
      b.result.score - a.result.score ||
      b.result.covered - a.result.covered ||
      a.hero.name.localeCompare(b.hero.name)
    );
    return rows;
  }

  function detailCell(result) {
    return el('div', { class: 'detail-cell' }, result.detail.map((d) => {
      const cls = d.direction === 'beats'
        ? 'pill pill--adv'
        : d.direction === 'loses' ? 'pill pill--thr' : 'pill';
      const text = d.direction === 'unknown' ? '·' : signed(d.points);
      return el('span', {
        class: cls,
        text,
        title: `${dataset.byId.get(d.enemy)?.name ?? d.enemy}: ${
          d.direction === 'beats' ? 'candidate wins'
          : d.direction === 'loses' ? 'candidate loses'
          : 'no measured matchup'
        }`,
      });
    }));
  }

  function resultTable(rows, { worst = false } = {}) {
    const list = worst ? rows.slice(-8).reverse() : rows.slice(0, 15);

    return el('div', { class: 'table-wrap' },
      el('table', { class: 'data rec-table' },
        el('thead', {}, el('tr', {},
          el('th', { text: '#' }),
          el('th', { text: 'Hero' }),
          el('th', { text: 'Role' }),
          el('th', { class: 'num', text: 'Net', title: 'Sum of measured advantage points' }),
          el('th', { class: 'num', text: 'Hit', title: 'How many of the selected enemies have a measured matchup' }),
          el('th', { text: 'Per enemy' })
        )),
        el('tbody', {}, list.map((row, i) => {
          const { hero, result } = row;
          return el('tr', {},
            el('td', { class: 'rec-rank', text: worst ? '·' : String(i + 1) }),
            el('td', {},
              el('a', {
                class: 'hero-inline',
                href: `#/hero/${encodeURIComponent(hero.id)}`,
              },
                img(hero.portrait_url, hero.name, { cls: 'hero-inline__art', width: 24, height: 32 }),
                el('span', { text: hero.name })
              )
            ),
            el('td', { text: hero.roles.join(' / ') || DASH }),
            el('td', {
              class: ['num', result.score >= 0 ? 'pos' : 'neg'],
              text: signed(result.score),
            }),
            el('td', { class: 'num', text: `${result.covered}/${result.total}` }),
            el('td', {}, detailCell(result))
          );
        }))
      )
    );
  }

  function renderResults() {
    clear(resultsBox);

    if (!slots.length) {
      append(resultsBox, el('div', { class: 'panel' },
        el('h2', { text: 'How this works' }),
        el('p', {
          class: 'note',
          text:
            'Add the enemy heroes you are drafting against. For every other hero the tool sums the measured ' +
            'advantage points from counters.json: added when that hero defeats an enemy, subtracted when an enemy ' +
            'defeats it. Heroes with no measured matchup against any selected enemy are left out rather than shown ' +
            'as a false zero.',
        }),
        el('p', {
          class: 'note',
          text:
            'Advantage points are win-rate gaps in percentage points taken from the MLBBDex statistics snapshot ' +
            'for all ranks combined. A higher net score means a larger measured edge across this line-up.',
        })
      ));
      return;
    }

    const rows = candidateRows();

    if (!rows.length) {
      append(resultsBox, el('div', { class: 'panel' },
        el('h2', { text: 'No measured matchups' }),
        el('p', {
          class: 'note',
          text: 'None of the selected heroes has a counter edge in the dataset, so no score can be computed.',
        })
      ));
      return;
    }

    const names = slots.map((id) => dataset.byId.get(id)?.name ?? id).join(', ');

    append(resultsBox,
      el('div', { class: 'panel' },
        el('h2', { text: `Best answers to ${names}` }),
        resultTable(rows),
        el('p', {
          class: 'note',
          text: `Scored ${rows.length} heroes that have at least one measured matchup against this line-up. ` +
            '“Hit” counts how many of the selected enemies are actually covered by data.',
        })
      ),
      el('div', { class: 'panel' },
        el('h2', { text: 'Worst into this line-up' }),
        resultTable(rows, { worst: true }),
        el('p', {
          class: 'note',
          text: 'The weakest net scores among heroes that do have data — useful for avoiding a bad pick.',
        })
      )
    );
  }

  function build(query) {
    const vs = query.get('vs');
    slots = vs
      ? vs.split(',').filter((id) => dataset.byId.has(id)).slice(0, MAX_SLOTS)
      : [];

    input = el('input', {
      type: 'search',
      placeholder: 'Search enemy hero…',
      'aria-label': 'Search enemy hero',
      autocomplete: 'off',
    });

    input.addEventListener('input', () => {
      filterText = input.value;
      cursor = 0;
      renderSuggest();
    });

    input.addEventListener('keydown', (event) => {
      const list = suggestions();
      if (event.key === 'ArrowDown') {
        cursor = Math.min(list.length - 1, cursor + 1);
        renderSuggest();
        event.preventDefault();
      } else if (event.key === 'ArrowUp') {
        cursor = Math.max(0, cursor - 1);
        renderSuggest();
        event.preventDefault();
      } else if (event.key === 'Enter') {
        const pick = list[cursor];
        if (pick) add(pick);
        event.preventDefault();
      }
    });

    suggestBox = el('div', { class: 'suggest' });
    slotsBox = el('div', {});
    resultsBox = el('div', { class: 'stack' });

    countNode = el('span', { class: 'pickbox__count', text: `0 / ${MAX_SLOTS}` });

    const pickbox = el('div', { class: 'pickbox' },
      el('div', { class: 'pickbox__head' }, el('h2', { text: 'Enemy line-up' }), countNode),
      el('div', { class: 'pickbox__input' }, input),
      suggestBox,
      slotsBox
    );

    const head = el('div', { class: 'page-head' },
      el('h1', { text: 'Counter Lab' }),
      el('p', {
        class: 'lede',
        text:
          'Draft answers computed from the measured counter graph, not opinion. Add up to five enemy heroes and ' +
          'read the net advantage each remaining hero holds against them.',
      })
    );

    renderSuggest();
    renderSlots();
    renderResults();

    return el('div', { class: 'stack' },
      head,
      el('div', { class: 'lab-grid' }, pickbox, resultsBox)
    );
  }

  return function render(params, query) {
    void params;
    return build(query);
  };
}
