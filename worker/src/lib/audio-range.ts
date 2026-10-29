/**
 * Aset audio hero dengan sokong Range request.
 *
 * Workers Static Assets menghantar fail penuh dengan status 200 - tiada
 * 206 dan tiada `Content-Range`. Safari/iOS memerlukan Range untuk main
 * media (dan untuk probe position semasa streaming), jadi route `/audio/*`
 * dihantar ke Worker dulu (lihat `run_worker_first` dalam wrangler) dan
 * di-slice di sini.
 *
 * Nama folder/fail mengandungi koma dan ruang, jadi URL datang sebagai
 * %2C dan %20 - ia dihantar ke asset server apa adanya (asset server
 * decode sendiri untuk cari fail).
 */
import type { Env } from '../types';

const AUDIO_PREFIX = '/audio/';

/** `bytes=start-end` (satu sahaja - tiada multi-range). */
function parseRange(header: string): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, startRaw, endRaw] = match;

  // Suffix range: `bytes=-500` -> 500 bait terakhir.
  if (startRaw === '') {
    if (endRaw === '') return null;
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: -suffix, end: -1 };
  }

  const start = Number(startRaw);
  if (!Number.isFinite(start)) return null;
  return { start, end: endRaw === '' ? Number.MAX_SAFE_INTEGER : Number(endRaw) };
}

export async function handleAudioAsset(request: Request, env: Env): Promise<Response | null> {
  if (!env.ASSETS) return null;

  let upstream: Response;
  try {
    upstream = await env.ASSETS.fetch(request);
  } catch {
    return null;
  }

  // Fail tak wujud - biar asset server/orang lain handle (404 biasa).
  if (upstream.status !== 200) return null;

  const contentType = upstream.headers.get('Content-Type') ?? 'application/octet-stream';
  const cacheControl =
    upstream.headers.get('Cache-Control') ?? 'public, max-age=31536000, immutable';

  const rangeHeader = request.headers.get('Range');

  /** Header asas: cache + security, serasi dengan `_headers` worker. */
  const baseHeaders = (): Headers => {
    const headers = new Headers({
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    });
    const etag = upstream.headers.get('ETag');
    if (etag) headers.set('ETag', etag);
    return headers;
  };

  if (!rangeHeader) {
    const headers = baseHeaders();
    const length = upstream.headers.get('Content-Length');
    if (length) headers.set('Content-Length', length);
    return new Response(upstream.body, { status: 200, headers });
  }

  const parsed = parseRange(rangeHeader);
  if (!parsed) {
    // Range tidak difahami - pulangkan fail penuh (200).
    return new Response(upstream.body, { status: 200, headers: baseHeaders() });
  }

  const body = await upstream.arrayBuffer();
  const total = body.byteLength;

  let start = parsed.start;
  let end = parsed.end;

  if (start < 0) {
    // Suffix range.
    start = Math.max(0, total + start);
    end = total - 1;
  } else {
    end = Math.min(end, total - 1);
  }

  if (start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${total}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const chunk = body.slice(start, end + 1);
  const headers = baseHeaders();
  headers.set('Content-Length', String(chunk.byteLength));
  headers.set('Content-Range', `bytes ${start}-${end}/${total}`);

  return new Response(chunk, { status: 206, headers });
}

export function isAudioPath(pathname: string): boolean {
  return pathname.startsWith(AUDIO_PREFIX);
}
