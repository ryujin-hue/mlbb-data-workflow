import { fetchUpstreamBundle } from './lib/fetch-upstream';
import { normalizeBundleToDataset } from './lib/normalize';
import { nextDailyUtcIso, toIsoNow } from './lib/time';
import { readDataset, readMeta, writeDataset, writeMeta } from './lib/store';
import type { Env, RuntimeMeta } from './types';

const SOURCE_NAME = 'MLBBDex GitHub mirror';

function parseCronHourUtc(env: Env): number {
  const value = Number(env.CRON_HOUR_UTC ?? '2');
  return Number.isFinite(value) && value >= 0 && value <= 23 ? Math.floor(value) : 2;
}

function parseCacheSeconds(env: Env): number {
  const value = Number(env.DATA_CACHE_SECONDS ?? '300');
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 300;
}

function corsOrigin(request: Request, env: Env): string {
  const allowed = env.ALLOWED_ORIGIN?.trim();
  if (!allowed) return '*';

  const origin = request.headers.get('Origin')?.trim();
  if (origin && origin === allowed) return origin;
  return allowed;
}

function jsonResponse(body: unknown, status: number, request: Request, env: Env, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Access-Control-Allow-Origin', corsOrigin(request, env));
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,X-Refresh-Token');

  return new Response(JSON.stringify(body, null, 2), { status, headers });
}

function preflight(request: Request, env: Env): Response {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', corsOrigin(request, env));
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,X-Refresh-Token');
  return new Response(null, { status: 204, headers });
}

function buildBootMeta(env: Env): RuntimeMeta {
  const hour = parseCronHourUtc(env);
  return {
    status: 'bootstrapping',
    source: SOURCE_NAME,
    patch: null,
    totalHeroes: 0,
    lastUpdated: null,
    lastAttemptAt: null,
    nextUpdateAt: nextDailyUtcIso(hour),
    scheduleUtc: `0 ${hour} * * *`,
    lastError: null,
  };
}

function refreshAllowed(request: Request, env: Env): boolean {
  const expected = env.MANUAL_REFRESH_TOKEN?.trim();
  if (!expected) return true;

  const provided = request.headers.get('X-Refresh-Token')?.trim();
  return Boolean(provided && provided === expected);
}

async function refreshDataset(env: Env, trigger: string): Promise<RuntimeMeta> {
  const now = toIsoNow();
  const scheduleHour = parseCronHourUtc(env);
  const schedule = `0 ${scheduleHour} * * *`;
  const previousMeta = await readMeta(env.MLBB_KV);

  try {
    const upstreamBase = env.UPSTREAM_BASE_URL?.trim();
    const bundle = await fetchUpstreamBundle(upstreamBase);
    const payload = normalizeBundleToDataset(
      bundle,
      upstreamBase || 'https://raw.githubusercontent.com/achedon12/mlbb/develop'
    );

    await writeDataset(env.MLBB_KV, payload, now);

    const meta: RuntimeMeta = {
      status: 'live',
      source: SOURCE_NAME,
      patch: payload.manifest.game_patch,
      totalHeroes: payload.manifest.counts.heroes,
      lastUpdated: payload.manifest.generated_at_utc,
      lastAttemptAt: now,
      nextUpdateAt: nextDailyUtcIso(scheduleHour),
      scheduleUtc: schedule,
      lastError: null,
    };

    await writeMeta(env.MLBB_KV, meta);
    console.log(`[refresh] success trigger=${trigger} heroes=${meta.totalHeroes}`);
    return meta;
  } catch (error) {
    const stale = previousMeta?.lastUpdated ? 'stale' : 'error';
    const fallback: RuntimeMeta = {
      status: stale,
      source: SOURCE_NAME,
      patch: previousMeta?.patch ?? null,
      totalHeroes: previousMeta?.totalHeroes ?? 0,
      lastUpdated: previousMeta?.lastUpdated ?? null,
      lastAttemptAt: now,
      nextUpdateAt: nextDailyUtcIso(scheduleHour),
      scheduleUtc: schedule,
      lastError: String(error),
    };

    await writeMeta(env.MLBB_KV, fallback);
    console.error(`[refresh] failed trigger=${trigger}`, error);
    throw error;
  }
}

async function handleGetMeta(request: Request, env: Env): Promise<Response> {
  const meta = (await readMeta(env.MLBB_KV)) ?? buildBootMeta(env);
  return jsonResponse(meta, 200, request, env, {
    'Cache-Control': 'no-store',
  });
}

async function handleGetDataset(request: Request, env: Env): Promise<Response> {
  let stored = await readDataset(env.MLBB_KV);

  if (!stored) {
    try {
      await refreshDataset(env, 'read-through');
      stored = await readDataset(env.MLBB_KV);
    } catch (error) {
      return jsonResponse(
        {
          error: 'dataset_unavailable',
          message: String(error),
        },
        503,
        request,
        env,
        { 'Cache-Control': 'no-store' }
      );
    }
  }

  if (!stored) {
    return jsonResponse(
      {
        error: 'dataset_unavailable',
        message: 'No dataset available in KV yet.',
      },
      503,
      request,
      env,
      { 'Cache-Control': 'no-store' }
    );
  }

  const cacheSeconds = parseCacheSeconds(env);
  return jsonResponse(
    {
      ...stored.payload,
      runtime: {
        storedAt: stored.storedAt,
      },
    },
    200,
    request,
    env,
    {
      'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
    }
  );
}

async function handleManualRefresh(request: Request, env: Env): Promise<Response> {
  if (!refreshAllowed(request, env)) {
    return jsonResponse(
      {
        error: 'unauthorized',
        message: 'Invalid X-Refresh-Token',
      },
      401,
      request,
      env
    );
  }

  try {
    const meta = await refreshDataset(env, 'manual');
    return jsonResponse(
      {
        ok: true,
        meta,
      },
      200,
      request,
      env,
      { 'Cache-Control': 'no-store' }
    );
  } catch (error) {
    return jsonResponse(
      {
        error: 'refresh_failed',
        message: String(error),
      },
      500,
      request,
      env,
      { 'Cache-Control': 'no-store' }
    );
  }
}

async function handleScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  try {
    await refreshDataset(env, `cron@${event.cron}`);
  } catch (error) {
    console.error('[scheduled] refresh failed', error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return preflight(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/meta') {
      return handleGetMeta(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/dataset') {
      return handleGetDataset(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/refresh') {
      return handleManualRefresh(request, env);
    }

    return jsonResponse(
      {
        service: 'mlbb-meta-worker',
        endpoints: ['/api/meta', '/api/dataset', '/api/refresh'],
      },
      200,
      request,
      env,
      { 'Cache-Control': 'no-store' }
    );
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(event, env));
  },
};
