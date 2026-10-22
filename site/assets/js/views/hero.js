/** Single hero detail: attributes, skills, measured matchups and synergies. */

import { el, img } from '../dom.js';
import { matchupRow, ratingRow, panel, tierBadge, metric } from '../components.js';
import { percent, integer, DASH, utcStamp } from '../format.js';

const GROWTH_STATS = [
  { key: 'hp', label: 'HP', a: 'hp1', b: 'hp15' },
  { key: 'mana', label: 'Mana / resource', a: 'mana1', b: 'mana15' },
  { key: 'patk', label: 'Physical ATK', a: 'physical_atk1', b: 'physical_atk15' },
  { key: 'pdef', label: 'Physical DEF', a: 'physical_def1', b: 'physical_def15' },
  { key: 'mdef', label: 'Magic DEF', a: 'magic_def1', b: 'magic_def15' },
];

const FLAT_STATS = [
  { key: 'movement_spd', label: 'Movement speed' },
  { key: 'hp_regen1', label: 'HP regen' },
  { key: 'basic_atk_range', label: 'Basic attack range' },
];

function tagList(values, variant) {
  if (!values.length) return null;
  return el('div', { class: 'taglist' }, values.map((v) =>
    el('span', { class: ['tag', variant ? `tag--${variant}` : null], text: v })
  ));
}

function skillLabel(skill, index, total) {
  if (skill.label) return skill.label;
  if (index === 0) return 'Passive';
  if (total === 4 && index === 3) return 'Ultimate';
  return `Skill ${index}`;
}

export function createHeroView(dataset) {
  return function render(params) {
    const hero = dataset.byId.get(params.id);

    if (!hero) {
      return el('div', { class: 'error-box' },
        el('h2', { text: 'Hero not found' }),
        el('p', {
          class: 'note',
          text: `No hero with id "${params.id}" exists in heroes.json.`,
        }),
        el('a', { class: 'back-link', href: '#/heroes', text: '← Back to roster' })
      );
    }

    const beats = dataset.beats.get(hero.id) ?? [];
    const beatenBy = dataset.beatenBy.get(hero.id) ?? [];
    const stats = hero.stats;

    /* ------------------------------------------------------------- header */

    const art = el(
      'div',
      { class: ['hero-head__art', hero.portrait_url ? null : 'hero-head__art--empty'] },
      hero.portrait_url
        ? img(hero.portrait_url, hero.name, { width: 168, height: 224 })
        : el('span', { text: 'no portrait' })
    );

    const titleRow = el(
      'div',
      { class: 'page-head__row' },
      el('div', {},
        el('h1', { class: 'hero-head__name', text: hero.name }),
        hero.title ? el('p', { class: 'hero-head__title', text: hero.title }) : null
      ),
      stats?.tier ? tierBadge(stats.tier, 'lg') : null
    );

    const info = el(
      'div',
      {},
      titleRow,
      tagList(hero.roles, 'role'),
      tagList(hero.lanes, 'lane'),
      tagList(hero.speciality, null),
      el(
        'div',
        { class: 'metric-row' },
        metric('Win rate', percent(stats?.win_rate), stats?.rank_scope ? `scope: ${stats.rank_scope}` : null),
        metric('Pick rate', percent(stats?.pick_rate)),
        metric('Ban rate', percent(stats?.ban_rate)),
        metric('Difficulty', hero.difficulty === null ? DASH : `${hero.difficulty}/10`),
        metric('Released', hero.release_year === null ? DASH : String(hero.release_year))
      ),
      stats
        ? null
        : el('p', {
            class: 'callout callout--warn',
            style: { marginTop: '12px' },
            text:
              'This hero has no rank statistics in the source snapshot, so win, pick and ban rates are absent. ' +
              'They are not estimated here.',
          })
    );

    const head = el('div', { class: 'hero-head' }, art, info);

    /* ------------------------------------------------------------ ratings */

    const r = hero.ratings ?? {};
    const ratingsPanel = panel('Attribute ratings',
      el('div', { class: 'rating-list' },
        ratingRow('Offense', r.offense),
        ratingRow('Durability', r.durability),
        ratingRow('Ability effect', r.ability_effect),
        ratingRow('Difficulty', r.difficulty)
      ),
      el('p', {
        class: 'note',
        text: 'Ratings are the 1–10 values published by the source dataset, not computed by this site.',
      })
    );

    /* -------------------------------------------------------- base stats */

    const bs = hero.base_stats ?? {};
    const growthRows = GROWTH_STATS.filter(({ a, b }) => bs[a] !== undefined || bs[b] !== undefined)
      .map(({ label, a, b }) => ({
        stat: label,
        lv1: bs[a] === null || bs[a] === undefined ? DASH : integer(bs[a]),
        lv15: bs[b] === null || bs[b] === undefined ? DASH : integer(bs[b]),
      }));

    const flatRows = FLAT_STATS.filter(({ key }) => bs[key] !== undefined && bs[key] !== null)
      .map(({ label, key }) => ({ stat: label, value: integer(bs[key]) }));

    const statsPanel = panel('Base statistics',
      growthRows.length
        ? el('div', { class: 'table-wrap' },
            el('table', { class: 'data' },
              el('thead', {}, el('tr', {},
                el('th', { text: 'Attribute' }),
                el('th', { class: 'num', text: 'Lv.1' }),
                el('th', { class: 'num', text: 'Lv.15' })
              )),
              el('tbody', {}, growthRows.map((row) => el('tr', {},
                el('td', { text: row.stat }),
                el('td', { class: 'num', text: row.lv1 }),
                el('td', { class: 'num', text: row.lv15 })
              )))
            )
          )
        : el('p', { class: 'note', text: 'No level-1 / level-15 stat pair is available for this hero.' }),
      flatRows.length
        ? el('div', { class: 'table-wrap', style: { marginTop: '10px' } },
            el('table', { class: 'data' },
              el('tbody', {}, flatRows.map((row) => el('tr', {},
                el('td', { text: row.stat }),
                el('td', { class: 'num', text: row.value })
              )))
            )
          )
        : null
    );

    /* ------------------------------------------------------------- skills */

    const skills = hero.skills.map((skill, index) =>
      el(
        'div',
        { class: 'skill' },
        skill.icon_url
          ? img(skill.icon_url, skill.name, { cls: 'skill__icon', width: 44, height: 44 })
          : el('div', { class: 'skill__icon skill__icon--empty', text: '—' }),
        el('div', {},
          el('div', { class: 'skill__head' },
            el('span', { class: 'skill__name', text: skill.name }),
            el('span', {
              class: ['skill__type', skill.type === 'passive' ? 'skill__type--passive' : null],
              text: skillLabel(skill, index, hero.skills.length),
            })
          ),
          el('p', {
            class: 'skill__desc',
            text: skill.description ?? 'The source dataset provides no description for this skill.',
          })
        )
      )
    );

    const skillsPanel = panel(`Skills (${hero.skills.length})`,
      el('div', { class: 'skill-list' }, skills),
      hero.skills.length > 4
        ? el('p', {
            class: 'note',
            text:
              'This hero has more than four abilities (extra stances or forms). Labels are positional rather than ' +
              '“Ultimate”, because the source does not mark which one is the ultimate.',
          })
        : null
    );

    /* ----------------------------------------------------------- matchups */

    const beatsPanel = panel(`Beats (${beats.length})`,
      beats.length
        ? el('div', {}, beats.map((edge) => matchupRow({
            hero,
            other: dataset.byId.get(edge.to),
            direction: 'beats',
            points: edge.advantage_points,
            strength: edge.strength,
          })))
        : el('p', {
            class: 'note',
            text: 'No measured winning matchup for this hero in the snapshot.',
          })
    );

    const threatsPanel = panel(`Loses to (${beatenBy.length})`,
      beatenBy.length
        ? el('div', {}, beatenBy.map((edge) => matchupRow({
            hero,
            other: dataset.byId.get(edge.other),
            direction: 'loses',
            points: edge.advantage_points,
            strength: edge.strength,
          })))
        : el('p', {
            class: 'note',
            text: 'No measured losing matchup for this hero in the snapshot.',
          })
    );

    /* ---------------------------------------------------------- synergies */

    const direct = hero.synergies
      .map((id) => dataset.byId.get(id))
      .filter(Boolean);

    const reverse = dataset.heroes
      .filter((h) => h.id !== hero.id && h.synergies.includes(hero.id))
      .map((h) => h);

    const synergyPanel = panel('Synergies',
      direct.length || reverse.length
        ? el('div', {},
            direct.length
              ? el('div', {},
                  el('h3', { text: `Listed for ${hero.name} (${direct.length})` }),
                  el('div', {}, direct.map((other) => matchupRow({
                    hero, other, direction: 'synergy', points: null, showBar: false,
                  })))
                )
              : null,
            reverse.length
              ? el('div', { style: { marginTop: direct.length ? '14px' : '0' } },
                  el('h3', { text: `Heroes that list ${hero.name} (${reverse.length})` }),
                  el('div', {}, reverse.map((other) => matchupRow({
                    hero, other, direction: 'synergy', points: null, showBar: false,
                  })))
                )
              : null,
            el('p', {
              class: 'note',
              text: 'Synergy lists carry no measured advantage value, so they are shown unordered.',
            })
          )
        : el('p', { class: 'note', text: 'No synergy data for this hero.' })
    );

    /* ------------------------------------------------------------ profile */

    const profileRows = [
      ['Damage type', hero.damage_type],
      ['Attack type', hero.attack_type],
      // The source stores "None" for heroes without mana or energy; the site
      // normalises that to null and shows it as an explicit absence.
      ['Resource', hero.resource ?? '— (none)'],
      ['Region', hero.region],
      ['Release year', hero.release_year === null ? null : String(hero.release_year)],
    ].filter(([k, v]) => Boolean(v));

    const profilePanel = panel('Profile',
      el('div', { class: 'table-wrap' },
        el('table', { class: 'data' },
          el('tbody', {}, profileRows.map(([k, v]) => el('tr', {},
            el('td', { text: k }),
            el('td', { class: 'num', text: v })
          )))
        )
      ),
      el('p', {
        class: 'note',
        text: `Snapshot: ${utcStamp(stats?.updated_at_utc ?? dataset.meta.generated_at_utc)}`,
      })
    );

    return el('div', { class: 'stack' },
      el('a', { class: 'back-link', href: '#/heroes', text: '← Roster' }),
      head,
      el('div', { class: 'grid-2', style: { marginTop: '14px' } }, ratingsPanel, statsPanel),
      skillsPanel,
      el('div', { class: 'grid-2' }, beatsPanel, threatsPanel),
      el('div', { class: 'grid-2' }, synergyPanel, profilePanel)
    );
  };
}
