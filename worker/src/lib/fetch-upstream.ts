import { sleep } from './time';

export interface UpstreamBundle {
  heroes: unknown;
  skills: unknown;
  statistics: unknown;
  items: unknown;
  visuals: unknown;
  sync: unknown;
}

const DEFAULT_BASE = 'https://raw.githubusercontent.com/achedon12/mlbb/develop';

const PATHS = {
  heroes: '/src/data/game/heroes.json',
  skills: '/src/data/game/skills.json',
  statistics: '/src/data/game/statistics.json',
  items: '/src/data/game/items.json',
  visuals: '/src/data/game/visuals.json',
  sync: '/src/data/game/sync.json',
} as const;

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

async function fetchJsonWithRetry(url: string, attempts = 3): Promise<unknown> {
  let lastError: unknown = null;

  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'mlbb-meta-worker/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} (${url})`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleep(250 * (i + 1) ** 2);
      }
    }
  }

  throw new Error(`Fetch failed after ${attempts} attempts: ${String(lastError)}`);
}

export async function fetchUpstreamBundle(baseUrl?: string): Promise<UpstreamBundle> {
  const base = baseUrl?.trim() || DEFAULT_BASE;

  const [heroes, skills, statistics, items, visuals, sync] = await Promise.all([
    fetchJsonWithRetry(joinUrl(base, PATHS.heroes)),
    fetchJsonWithRetry(joinUrl(base, PATHS.skills)),
    fetchJsonWithRetry(joinUrl(base, PATHS.statistics)),
    fetchJsonWithRetry(joinUrl(base, PATHS.items)),
    fetchJsonWithRetry(joinUrl(base, PATHS.visuals)),
    fetchJsonWithRetry(joinUrl(base, PATHS.sync)),
  ]);

  return { heroes, skills, statistics, items, visuals, sync };
}
