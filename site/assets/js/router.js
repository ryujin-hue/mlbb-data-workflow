/**
 * Hash router.
 *
 * Hash routing keeps deep links working on plain static hosting (Cloudflare
 * Pages, GitHub Pages) with no server rewrite rules.
 *
 * Route shape: `#/segment?query`
 */

const DEFAULT_PATH = '/heroes';

export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || DEFAULT_PATH;
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  return {
    path: '/' + segments.join('/'),
    segments,
    query: new URLSearchParams(queryPart ?? ''),
  };
}

export function buildHash(path, query) {
  const qs = query ? query.toString() : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function createRouter(routes, { onRender, onError }) {
  let current = null;

  function resolve(segments) {
    for (const route of routes) {
      const match = route.match(segments);
      if (match) return { route, params: match };
    }
    return null;
  }

  async function handle() {
    const { path, segments, query } = parseHash();
    const found = resolve(segments);

    if (!found) {
      window.location.hash = `#${DEFAULT_PATH}`;
      return;
    }

    // Avoid re-rendering when only the hash fragment is re-set to the same value.
    const key = path + (query.toString() ? `?${query}` : '');
    if (key === current && !found.route.alwaysRender) return;
    current = key;

    try {
      const node = await found.route.render(found.params, query);
      onRender(node, found.route, found.params, query);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[router] render failed', err);
      onError(err);
    }
  }

  window.addEventListener('hashchange', handle);

  return {
    start: handle,
    navigate(path, query, { replace = false } = {}) {
      const hash = buildHash(path, query);
      if (window.location.hash === hash) return;
      if (replace) {
        window.location.replace(hash);
      } else {
        window.location.hash = hash;
      }
      if (replace) handle();
    },
    /**
     * Rewrite the hash without triggering a re-render. Used by in-page
     * filters so the URL stays shareable while the view keeps its own state
     * and scroll position.
     */
    updateQuery(query) {
      const { path } = parseHash();
      const qs = query.toString();
      const hash = `#${path}${qs ? `?${qs}` : ''}`;
      current = hash;
      history.replaceState(null, '', hash);
    },
    refresh: () => {
      current = null;
      return handle();
    },
    currentPath: () => parseHash().path,
  };
}
