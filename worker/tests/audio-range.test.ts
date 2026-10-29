/**
 * Test sokong Range request untuk aset audio hero.
 *
 * Workers Static Assets menghantar fail penuh dengan status 200. Safari/iOS
 * memerlukan 206 + Content-Range untuk main media, jadi route `/audio/*`
 * diluluskan ke Worker dulu (lihat `run_worker_first` dalam wrangler) dan
 * di-slice di sini.
 *
 * Test ini guna Fetcher palsu - tak perlu network.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleAudioAsset, isAudioPath } from '../src/lib/audio-range.ts';
import type { Env } from '../src/types';

const PAYLOAD = new Uint8Array(1000).map((_, i) => i % 256);

function fakeEnv(contentType = 'audio/mpeg'): Env {
  return {
    ASSETS: {
      async fetch(): Promise<Response> {
        return new Response(PAYLOAD, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(PAYLOAD.byteLength),
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      },
    },
  } as unknown as Env;
}

function request(range?: string): Request {
  return new Request('https://example.test/audio/PICS/Mathilda/336387.mp3', {
    headers: range ? { Range: range } : {},
  });
}

test('isAudioPath recognizes the audio prefix', () => {
  assert.equal(isAudioPath('/audio/PICS/Mathilda/336387.mp3'), true);
  assert.equal(isAudioPath('/api/heroes'), false);
  assert.equal(isAudioPath('/'), false);
});

test('tanpa Range: hantar 200 penuh + Accept-Ranges', async () => {
  const response = await handleAudioAsset(request(), fakeEnv());
  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  const body = await response.arrayBuffer();
  assert.equal(body.byteLength, PAYLOAD.byteLength);
});

test('Range bytes=0-99: hantar 206 + Content-Range', async () => {
  const response = await handleAudioAsset(request('bytes=0-99'), fakeEnv());
  assert.ok(response);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 0-99/1000');
  assert.equal(response.headers.get('Content-Length'), '100');
  const body = new Uint8Array(await response.arrayBuffer());
  assert.equal(body.byteLength, 100);
  assert.deepEqual(Array.from(body.slice(0, 5)), Array.from(PAYLOAD.slice(0, 5)));
});

test('Range bytes=900-: potong hingga hujung fail', async () => {
  const response = await handleAudioAsset(request('bytes=900-'), fakeEnv());
  assert.ok(response);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 900-999/1000');
  assert.equal((await response.arrayBuffer()).byteLength, 100);
});

test('Range suffix bytes=-50: hantar 50 bait terakhir', async () => {
  const response = await handleAudioAsset(request('bytes=-50'), fakeEnv());
  assert.ok(response);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 950-999/1000');
  assert.equal((await response.arrayBuffer()).byteLength, 50);
});

test('Range luar jangkauan: 416 dengan Content-Range */total', async () => {
  const response = await handleAudioAsset(request('bytes=5000-6000'), fakeEnv());
  assert.ok(response);
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('Content-Range'), 'bytes */1000');
});

test('Range tidak difahami: pulangkan 200 penuh', async () => {
  const response = await handleAudioAsset(request('bytes=abc'), fakeEnv());
  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, PAYLOAD.byteLength);
});

test('tanpa binding ASSETS: pulangkan null (caller teruskan)', async () => {
  const response = await handleAudioAsset(request('bytes=0-1'), {} as Env);
  assert.equal(response, null);
});
