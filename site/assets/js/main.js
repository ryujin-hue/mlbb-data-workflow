/**
 * Entry point: load the dataset, wire the router, render views.
 *
 * Per docs/design/dataset-contract.md the site has no build step and no npm
 * dependency — it fetches static JSON from site/dataset/ and renders it.
 */

import { el, render } from './dom.js';
import { loadDataset } from './data.js';
import { createRouter } from './router.js';
import { createHeroesView } from './views/heroes.js';
import { createHeroView } from './views/hero.js';
import { createCountersView } from './views/counters.js';
import { createItemsView } from './views/items.js';
import { createSourcesView } from './views/sources.js';
import { utcStamp, DASH } from './format.js';

const SITE_NAME = 'MLBB Meta Center';

function errorScreen(err) {
  return el('div', { class: 'error-box' },
    el('h2', { text: 'The dataset could not be loaded' }),
    el('p', {
      class: 'note',
      text:
        'This site renders everything from static JSON in site/dataset/. If those files are missing or ' +
        'unreachable, no view can be built — nothing is substituted with sample data.',
    }),
    el('pre', { text: String(err?.stack ?? err) })
  );
}

async function boot() {
  const viewHost = document.getElementById('view');
  const navLinks = [...document.querySelectorAll('.nav__link')];
  const patchBadge = document.getElementById('patch-badge');
  const footerStamp = document.getElementById('footer-stamp');

  let dataset;
  try {
    dataset = await loadDataset();
  } catch (err) {
    console.error('[boot] dataset load failed', err);
    render(viewHost, errorScreen(err));
    return;
  }

  // Header / footer provenance.
  const patch = dataset.meta.game_patch;
  patchBadge.textContent = patch
    ? `patch ${patch} · ${dataset.heroes.length} heroes`
    : `${dataset.heroes.length} heroes · ${dataset.edges.length} matchups`;
  patchBadge.title = `Snapshot ${utcStamp(dataset.meta.generated_at_utc)}`;

  footerStamp.textContent =
    `dataset ${dataset.meta.schema_version ?? DASH} · generated ${utcStamp(dataset.meta.generated_at_utc)} · ` +
    `${dataset.heroes.length} heroes, ${dataset.edges.length} counter edges, ${dataset.items.length} items`;

  // Views need the router, and the router needs the views. Hand the views a
  // thin proxy so they can read the real router once it exists.
  let router;
  const routerApi = {
    updateQuery: (query) => router?.updateQuery(query),
  };

  const heroesView = createHeroesView(dataset, routerApi);
  const heroView = createHeroView(dataset);
  const countersView = createCountersView(dataset, routerApi);
  const itemsView = createItemsView(dataset, routerApi);
  const sourcesView = createSourcesView(dataset);

  const routes = [
    {
      name: 'heroes',
      match: (s) => (s.length === 1 && s[0] === 'heroes' ? {} : null),
      render: (params, query) => heroesView(params, query),
    },
    {
      name: 'heroes',
      match: (s) => (s.length === 2 && s[0] === 'hero' ? { id: decodeURIComponent(s[1]) } : null),
      render: (params, query) => heroView(params, query),
    },
    {
      name: 'counters',
      match: (s) => (s.length === 1 && s[0] === 'counters' ? {} : null),
      render: (params, query) => countersView(params, query),
    },
    {
      name: 'items',
      match: (s) => (s.length === 1 && s[0] === 'items' ? {} : null),
      render: (params, query) => itemsView(params, query),
    },
    {
      name: 'sources',
      match: (s) => (s.length === 1 && s[0] === 'sources' ? {} : null),
      render: (params, query) => sourcesView(params, query),
    },
  ];

  function mount(node, route, params) {
    render(viewHost, node);

    for (const link of navLinks) {
      link.classList.toggle('is-active', link.dataset.nav === route.name);
      if (link.classList.contains('is-active')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    document.title = route.name === 'heroes' && params?.id
      ? `${dataset.byId.get(params.id)?.name ?? params.id} — ${SITE_NAME}`
      : `${route.name === 'counters' ? 'Counter Lab' : route.name[0].toUpperCase() + route.name.slice(1)} — ${SITE_NAME}`;

    // Only scroll up on real navigation; in-page filters never reach here.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  router = createRouter(routes, {
    onRender: mount,
    onError: (err) => render(viewHost, errorScreen(err)),
  });

  router.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
