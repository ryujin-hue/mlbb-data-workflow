/**
 * Data & Sources.
 *
 * Shows provenance, the contract's quality gate as actually computed at load
 * time, the warnings the collector recorded, and any defect this site repaired
 * or worked around. Nothing here is decorative — every line is derived from
 * manifest.json or from checks run in data.js.
 */

import { el } from '../dom.js';
import { panel, dataTable } from '../components.js';
import { utcStamp, bytes, DASH, integer, pluralise } from '../format.js';

function classifyWarning(text) {
  const t = text.toLowerCase();
  if (t.includes('conflict') || t.includes('contradict') || t.includes('ambiguous')) return 'is-conflict';
  if (t.includes('no-counter-data') || t.includes('missing') || t.includes('failed')) return 'is-missing';
  if (t.includes('gap') || t.includes('incomplete') || t.includes('only')) return 'is-gap';
  return '';
}

export function createSourcesView(dataset) {
  return function render() {
    const { meta, integrity, quality } = dataset;

    const required = quality.filter((c) => !c.optional);
    const passed = required.filter((c) => c.pass).length;

    /* ---------------------------------------------------------- overview */

    const overview = panel('Dataset',
      el('div', { class: 'table-wrap' },
        el('table', { class: 'data' },
          el('tbody', {}, [
            ['Schema version', meta.schema_version],
            ['Generated (UTC)', utcStamp(meta.generated_at_utc)],
            ['Game patch', meta.game_patch ?? 'not recorded in manifest'],
            ['Heroes', integer(dataset.heroes.length)],
            ['Counter edges (usable)', `${integer(dataset.edges.length)}` +
              (meta.droppedEdges ? ` · ${meta.droppedEdges} dropped as unusable` : '')],
            ['Items', integer(dataset.items.length)],
            ['Maps', dataset.maps ? pluralise(dataset.maps.length, 'map') : 'none in this snapshot'],
          ].map(([k, v]) => el('tr', {},
            el('td', { text: k }),
            el('td', { class: 'num', text: v ?? DASH })
          )))
        )
      )
    );

    /* ----------------------------------------------------------- sources */

    const sourceRows = meta.sources.map((s) => ({
      name: s.name,
      records: integer(s.records),
      license: s.license ?? DASH,
      retrieved: utcStamp(s.retrieved_at_utc),
      status: s.status ?? DASH,
      url: el('a', { href: s.url, text: s.url, rel: 'noopener noreferrer', target: '_blank' }),
    }));

    const sourcesPanel = panel(`Upstream sources (${meta.sources.length})`,
      sourceRows.length
        ? dataTable({
            columns: [
              { key: 'name', label: 'Source' },
              { key: 'url', label: 'URL', wrap: true },
              { key: 'records', label: 'Records', num: true },
              { key: 'license', label: 'License' },
              { key: 'retrieved', label: 'Retrieved' },
              { key: 'status', label: 'Status' },
            ],
            rows: sourceRows,
          })
        : el('p', { class: 'note', text: 'manifest.json lists no sources.' }),
      el('p', {
        class: 'note',
        text:
          'Primary data comes from the MLBBDex dataset mirror (achedon12/mlbb), which carries Mobile Legends Wiki ' +
          'content under CC BY-SA 4.0. This site redistributes derived values only and is not affiliated with Moonton.',
      })
    );

    /* ------------------------------------------------------ quality gate */

    const gatePanel = panel(`Quality gate — ${passed} of ${required.length} required checks pass`,
      el('div', { class: 'table-wrap' },
        el('table', { class: 'data' },
          el('thead', {}, el('tr', {},
            el('th', { text: 'Check' }),
            el('th', { text: 'Result' }),
            el('th', { text: 'Detail' })
          )),
          el('tbody', {}, quality.map((c) => el('tr', {},
            el('td', { text: c.label }),
            el('td', {
              text: c.optional ? 'optional' : c.pass ? 'pass' : 'fail',
              style: {
                color: c.optional ? 'var(--info)' : c.pass ? 'var(--adv)' : 'var(--thr)',
                fontFamily: 'var(--mono)',
              },
            }),
            el('td', { class: 'wrap', text: c.detail })
          )))
        )
      ),
      meta.missingFiles.length
        ? el('p', { class: 'note', text: `Required files not present: ${meta.missingFiles.join('; ')}` })
        : null,
      el('p', {
        class: 'note',
        text: 'Checks are run in the browser at page load against the files actually fetched, not against a ' +
          'claim in the repository.',
      })
    );

    /* ---------------------------------------------------------- warnings */

    const warnings = meta.declaredWarnings;
    const warnPanel = panel(`Collector warnings (${warnings.length})`,
      warnings.length
        ? el('ul', { class: 'warn-list' }, warnings.map((w) =>
            el('li', { class: classifyWarning(w), text: w })
          ))
        : el('p', { class: 'note', text: 'The collector recorded no warnings.' }),
      el('p', {
        class: 'note',
        text: 'These are produced by the collection pipeline and reproduced verbatim. Conflicts mean two source ' +
          'sections disagree about the direction of a matchup; the measured counters list wins.',
      })
    );

    /* ------------------------------------------- defects handled in-site */

    const integrityPanel = panel(`Defects detected while loading (${integrity.length})`,
      integrity.length
        ? el('ul', { class: 'warn-list' }, integrity.map((issue) =>
            el('li', { class: 'is-missing', text: `[${issue.kind}] ${issue.detail}` })
          ))
        : el('p', { class: 'note', text: 'No data defect detected at load time.' }),
      el('p', {
        class: 'note',
        text:
          'This site never invents a value to fill a gap. Where the shipped snapshot is unusable, the affected ' +
          'view is disabled or the missing value is shown as an em dash.',
      })
    );

    /* --------------------------------------------------------- file sizes */

    const sizeRows = Object.entries(meta.fileBytes).map(([file, size]) => ({ file, size: bytes(size) }));
    const sizePanel = panel('Payload',
      sizeRows.length
        ? dataTable({
            columns: [
              { key: 'file', label: 'File' },
              { key: 'size', label: 'Transferred', num: true },
            ],
            rows: sizeRows,
          })
        : el('p', { class: 'note', text: 'No size information available.' }),
      el('p', {
        class: 'note',
        text: 'The entire dataset is fetched as static JSON at page load — there is no backend and no build step.',
      })
    );

    return el('div', { class: 'stack' },
      el('div', { class: 'page-head' },
        el('h1', { text: 'Data & Sources' }),
        el('p', {
          class: 'lede',
          text:
            'Provenance, coverage and known defects of the dataset behind this site. Every figure on this page is ' +
            'read from site/dataset/ at runtime or computed from it during load.',
        })
      ),
      el('div', { class: 'grid-2' }, overview, sizePanel),
      sourcesPanel,
      gatePanel,
      warnPanel,
      integrityPanel
    );
  };
}
