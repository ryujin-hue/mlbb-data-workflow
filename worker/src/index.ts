import { fetchUpstreamBundle } from './lib/fetch-upstream';
import { normalizeBundleToDataset } from './lib/normalize';
import { nextDailyUtcIso, toIsoNow } from './lib/time';
import {
  findSnapshotForDaysAgo,
  oldestSnapshotAgeDays,
  readDataset,
  readIndex,
  readMeta,
  readSnapshot,
  writeDataset,
  writeMeta,
} from './lib/store';
import { buildMetaMovers, computeDeltas, toSlimHeroes } from './lib/deltas';
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
      // stale-while-revalidate: client boleh pakai data lama sebentar sambil
      // mengambil versi baru di belakang layar.
      'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`,
    }
  );
}

/**
 * Daftar versi snapshot yang tersedia. Client memakainya untuk menampilkan
 * "versi data" dan untuk memilih dua snapshot yang dibandingkan.
 */
async function handleGetSnapshots(request: Request, env: Env): Promise<Response> {
  const index = await readIndex(env.MLBB_KV);
  return jsonResponse(index, 200, request, env, {
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
  });
}

/**
 * Delta / Meta Movers antara snapshot terkini dan snapshot ~N hari lalu.
 *
 *   GET /api/deltas?window=7d&threshold=0.5
 *
 * `window` bisa 1d / 7d / 30d. Perhitungan di edge supaya client tidak
 * perlu menarik dua dataset penuh untuk dibandingkan sendiri.
 */
async function handleGetDeltas(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const windowParam = (url.searchParams.get('window') ?? '7d').toLowerCase();
  const days = windowParam === '1d' ? 1 : windowParam === '30d' ? 30 : 7;

  // Ambang default 0.5. `Number(null)` menghasilkan 0 yang lolos
  // isFinite, jadi sebelumnya `?window=7d` tanpa threshold berakhir dengan
  // threshold 0 -> semua noise dianggap "rising". Parse eksplisit.
  const rawThreshold = url.searchParams.get('threshold');
  const parsedThreshold =
    rawThreshold === null || rawThreshold.trim() === '' ? Number.NaN : Number(rawThreshold);
  const threshold = Number.isFinite(parsedThreshold) ? parsedThreshold : undefined;
  const effectiveThreshold = threshold ?? 0.5;

  const CACHE = {
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
  };

  const current = await readDataset(env.MLBB_KV);
  if (!current) {
    return jsonResponse(
      { error: 'dataset_unavailable', message: 'Belum ada snapshot di KV.' },
      503,
      request,
      env,
      { 'Cache-Control': 'no-store' }
    );
  }

  const index = await readIndex(env.MLBB_KV);
  const latestEntry = index.entries[0] ?? null;
  const currentVersion = latestEntry?.version ?? 'current';
  const currentMeasuredAt = current.payload.manifest?.rates_summary?.measured_at_utc ?? null;

  const emptyResponse = async (
    reason: string,
    message: string
  ): Promise<Response> =>
    jsonResponse(
      {
        available: false,
        reason,
        message,
        window: windowParam,
        threshold: effectiveThreshold,
        from: { version: 'none', measured_at_utc: null, stored_at: null },
        to: { version: currentVersion, measured_at_utc: currentMeasuredAt },
        actual_days: null,
        approximate: false,
        oldest_available_days: await oldestSnapshotAgeDays(env.MLBB_KV),
        rising: [],
        falling: [],
        steady: 0,
        new_heroes: [],
        deltas: [],
      },
      200,
      request,
      env,
      CACHE
    );

  const entry = await findSnapshotForDaysAgo(env.MLBB_KV, days);
  if (!entry) {
    // Bukan 404: "tidak ada riwayat" itu kondisi normal pada hari-hari
    // pertama. Client membaca flag-nya, bukan menebak dari status code.
    const oldest = await oldestSnapshotAgeDays(env.MLBB_KV);
    return emptyResponse(
      'no_history',
      oldest === null
        ? `Belum ada snapshot lama untuk window ${windowParam}. Butuh minimal 2 versi (satu per hari).`
        : `Snapshot tertua yang tersedia berumur ${oldest} hari, belum cukup untuk window ${windowParam}.`
    );
  }

  const previous = await readSnapshot(env.MLBB_KV, entry.version);
  if (!previous) {
    return emptyResponse('snapshot_expired', `Snapshot ${entry.version} sudah tidak ada.`);
  }

  // Berapa umur sebenarnya dari snapshot pembanding. Kalau jauh dari window
  // yang diminta, tandai `approximate` supaya UI bisa jujur mengatakannya.
  const latestAt = Date.parse(latestEntry?.stored_at ?? '');
  const entryAt = Date.parse(entry.stored_at);
  const actualDays =
    Number.isFinite(latestAt) && Number.isFinite(entryAt)
      ? Math.round(((latestAt - entryAt) / (24 * 60 * 60 * 1000)) * 10) / 10
      : null;

  const currentLike = {
    version: currentVersion,
    measured_at_utc: currentMeasuredAt,
    heroes: current.payload.heroes.heroes,
  };
  const previousLike = {
    version: entry.version,
    measured_at_utc: entry.measured_at_utc,
    heroes: previous.payload.heroes.heroes,
  };

  const movers = buildMetaMovers(currentLike, previousLike, {
    window: windowParam,
    ...(threshold === undefined ? {} : { threshold }),
  });

  return jsonResponse(
    {
      available: true,
      ...movers,
      actual_days: actualDays,
      approximate: actualDays !== null && Math.abs(actualDays - days) > 0.5,
      deltas: computeDeltas(currentLike, previousLike),
    },
    200,
    request,
    env,
    CACHE
  );
}

/**
 * Indeks hero ramping.
 *
 * Grid daftar hero cuma butuh identitas, role/lane, dan rate. Membawa
 * skills + counters + skins di payload daftar bikin respons ~1 MB; versi ini
 * memangkas ke puluhan KB. Detail hero diambil terpisah per-hero.
 *
 *   GET /api/heroes?rank=all|epic|legend|mythic|honor|glory
 */
async function handleGetHeroIndex(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rank = url.searchParams.get('rank') ?? 'all';

  const stored = await readDataset(env.MLBB_KV);
  if (!stored) {
    return jsonResponse(
      { error: 'dataset_unavailable', message: 'Belum ada snapshot di KV.' },
      503,
      request,
      env,
      { 'Cache-Control': 'no-store' }
    );
  }

  const heroes = toSlimHeroes(stored.payload.heroes.heroes as never, rank);
  const manifest = stored.payload.manifest;

  return jsonResponse(
    {
      heroes,
      manifest: {
        schema_version: manifest.schema_version,
        generated_at_utc: manifest.generated_at_utc,
        game_patch: manifest.game_patch,
        counts: manifest.counts,
        rates_summary: manifest.rates_summary ?? null,
        sources: manifest.sources,
        warnings: manifest.warnings,
      },
      runtime: { storedAt: stored.storedAt },
    },
    200,
    request,
    env,
    {
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
    }
  );
}

/**
 * Detail satu hero: skill, rating, base stats, matchup, dan item yang cocok.
 *
 *   GET /api/hero?id=alucard
 */
async function handleGetHeroDetail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  const stored = await readDataset(env.MLBB_KV);
  if (!stored) {
    return jsonResponse(
      { error: 'dataset_unavailable', message: 'Belum ada snapshot di KV.' },
      503,
      request,
      env,
      { 'Cache-Control': 'no-store' }
    );
  }

  if (!id) {
    return jsonResponse(
      { error: 'missing_id', message: 'Parameter id wajib diisi.' },
      400,
      request,
      env,
      { 'Cache-Control': 'no-store' }
    );
  }

  const hero = stored.payload.heroes.heroes.find((h) => h.id === id);
  if (!hero) {
    return jsonResponse(
      { error: 'hero_not_found', message: `Hero "${id}" tidak ada di dataset.` },
      404,
      request,
      env,
      { 'Cache-Control': 'no-store' }
    );
  }

  const edges = stored.payload.counters.edges.filter((e) => e.from === id || e.to === id);
  const items = stored.payload.items.items.filter((item) => {
    const best = (item.best_for ?? '').toLowerCase();
    return best.includes(hero.name.toLowerCase()) || best.includes('all heroes');
  });

  return jsonResponse(
    {
      hero,
      counters: { edges },
      items: { items },
      runtime: { storedAt: stored.storedAt },
    },
    200,
    request,
    env,
    {
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
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

    if (request.method === 'GET' && url.pathname === '/api/heroes') {
      return handleGetHeroIndex(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/hero') {
      return handleGetHeroDetail(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/snapshots') {
      return handleGetSnapshots(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/deltas') {
      return handleGetDeltas(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/refresh') {
      return handleManualRefresh(request, env);
    }

    return jsonResponse(
      {
        service: 'mlbb-meta-worker',
        endpoints: [
          '/api/meta',
          '/api/dataset',
          '/api/heroes',
          '/api/hero',
          '/api/snapshots',
          '/api/deltas',
          '/api/refresh',
        ],
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
