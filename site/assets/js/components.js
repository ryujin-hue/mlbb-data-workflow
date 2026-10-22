/** Shared view components. */

import { el, img } from './dom.js';
import { tierKey, percent, integer, DASH } from './format.js';

/** Tier pill. `size` is 'sm' (grid badge) or 'lg' (detail header). */
export function tierBadge(tier, size = 'sm') {
  const key = tierKey(tier);
  const node = el('span', {
    class: ['tier-badge', size === 'sm' ? 'hero-card__tier' : null].filter(Boolean),
    text: tier ?? '?',
    title: tier ? `Tier ${tier}` : 'No tier data',
  });
  if (key) node.style.color = `var(--tier-${key})`;
  else node.style.color = 'var(--ink-3)';
  return node;
}

/** Link card used by the hero grid. */
export function heroCard(hero) {
  return el(
    'a',
    {
      class: 'hero-card',
      href: `#/hero/${encodeURIComponent(hero.id)}`,
      title: `${hero.name}${hero.title ? ` — ${hero.title}` : ''}`,
    },
    el(
      'div',
      { class: 'hero-card__art' },
      img(hero.portrait_url, hero.name, { cls: '', width: 120, height: 160 }),
      hero.stats?.tier ? tierBadge(hero.stats.tier) : null
    ),
    el(
      'div',
      { class: 'hero-card__body' },
      el('div', { class: 'hero-card__name', text: hero.name }),
      el('div', {
        class: 'hero-card__sub',
        text: [hero.roles.join(' / '), hero.lanes.join(' / ')].filter(Boolean).join(' · ') || DASH,
      }),
      el(
        'div',
        { class: 'hero-card__wr' },
        el('span', { text: `WR ${percent(hero.stats?.win_rate)}` }),
        el('span', { text: hero.difficulty === null ? '' : `D${hero.difficulty}` })
      )
    )
  );
}

/** Labelled 10-point rating bar. */
export function ratingRow(label, value, max = 10) {
  const pips = [];
  for (let i = 0; i < max; i += 1) {
    pips.push(el('span', {
      class: ['rating__pip', value !== null && i < value ? 'is-filled' : null],
    }));
  }
  return el(
    'div',
    { class: 'rating' },
    el('span', { class: 'rating__label', text: label }),
    el('div', { class: 'rating__track' }, pips),
    el('span', { class: 'rating__value', text: value === null ? DASH : String(value) })
  );
}

/**
 * One matchup row. `direction` is 'beats' (this hero wins) or 'loses'.
 * `points` is the measured advantage in percentage points, may be null.
 */
export function matchupRow({ hero, other, direction, points, strength, showBar = true }) {
  // 'synergy' rows carry no measured value and must not use win/loss colour.
  const neutral = direction === 'synergy';
  const scale = Math.min(100, Math.abs(points ?? 0) * 10);
  const sign = direction === 'beats' ? '+' : '−';

  const verb = neutral
    ? 'has a synergy listing with'
    : direction === 'beats' ? 'beats' : 'loses to';

  return el(
    'a',
    {
      class: 'matchup-link',
      href: `#/hero/${encodeURIComponent(other.id)}`,
      title: `${hero.name} ${verb} ${other.name}`,
    },
    el(
      'div',
      { class: 'matchup' },
      el('div', { class: 'matchup__art' }, img(other.portrait_url, other.name, { width: 34, height: 44 })),
      el(
        'div',
        {},
        el('div', { class: 'matchup__name', text: other.name }),
        el('div', {
          class: 'matchup__sub',
          text: [other.roles.join('/'), other.stats?.tier ? `tier ${other.stats.tier}` : null]
            .filter(Boolean)
            .join(' · '),
        }),
        showBar && points !== null
          ? el('div', {
              class: ['adv-bar', direction === 'beats' ? 'adv-bar--adv' : 'adv-bar--thr'],
            }, el('span', { style: { width: `${scale}%` } }))
          : null
      ),
      el('div', {
        class: ['matchup__score',
          neutral ? null : direction === 'beats' ? 'matchup__score--adv' : 'matchup__score--thr'],
        text: neutral ? '·' : points === null || points === undefined ? DASH : `${sign}${Math.abs(points).toFixed(1)}`,
        title: neutral
          ? 'Synergy listing — no measured advantage'
          : strength === null || strength === undefined
            ? 'Advantage in win-rate points'
            : `Advantage ${points} points · normalised strength ${strength}`,
      })
    )
  );
}

/** Section wrapper with an uppercase heading. */
export function panel(title, ...children) {
  return el('section', { class: 'panel' }, title ? el('h2', { text: title }) : null, ...children);
}

/** Key/value metric cell used in the stat strip and hero metrics. */
export function metric(label, value, sub) {
  return el(
    'div',
    { class: 'metric' },
    el('div', { class: 'metric__label', text: label }),
    el('div', {
      class: ['metric__value', value === DASH ? 'metric__value--na' : null],
      text: value,
    }),
    sub ? el('div', { class: 'statstrip__sub', text: sub }) : null
  );
}

/** Filter chip with an optional facet count. */
export function chip({ label, count, active, onToggle, title }) {
  return el(
    'button',
    {
      type: 'button',
      class: ['chip', active ? 'is-on' : null],
      'aria-pressed': active ? 'true' : 'false',
      title: title ?? null,
      onClick: onToggle,
    },
    el('span', { text: label }),
    count === undefined ? null : el('span', { class: 'chip__n', text: String(count) })
  );
}

/** A table built from plain column descriptors. */
export function dataTable({ columns, rows, caption }) {
  const head = el('tr', {}, columns.map((c) => el('th', {
    class: c.num ? 'num' : null,
    text: c.label,
    title: c.title ?? null,
  })));

  const body = rows.map((row) => el('tr', {}, columns.map((c) => el('td', {
    class: [c.num ? 'num' : null, c.wrap ? 'wrap' : null].filter(Boolean).join(' ') || null,
  }, row[c.key] ?? DASH))));

  return el(
    'div',
    { class: 'table-wrap' },
    el('table', { class: 'data' },
      caption ? el('caption', { class: 'sr-only', text: caption }) : null,
      el('thead', {}, head),
      el('tbody', {}, body))
  );
}

export { integer };
