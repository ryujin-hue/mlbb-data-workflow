import { DASH } from './format.js';

const REFRESH_MS = 5 * 60 * 1000;
const TICK_MS = 60 * 1000;

function toMs(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function formatAgo(targetMs, nowMs = Date.now()) {
  if (!targetMs) return DASH;
  const delta = Math.max(0, nowMs - targetMs);

  if (delta < 60 * 1000) return 'just now';
  const mins = Math.floor(delta / (60 * 1000));
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function formatNext(targetMs, nowMs = Date.now()) {
  if (!targetMs) return DASH;
  const delta = targetMs - nowMs;
  if (delta <= 0) return 'due now';

  const mins = Math.ceil(delta / (60 * 1000));
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  const remain = mins % 60;
  return remain === 0 ? `${hours}h` : `${hours}h ${remain}m`;
}

function resolveApiBase() {
  const byMeta = document.querySelector('meta[name="mlbb-api-base"]')?.content?.trim();
  if (byMeta) return byMeta.replace(/\/$/, '');

  if (typeof window !== 'undefined' && typeof window.MLBB_API_BASE === 'string') {
    const fromWindow = window.MLBB_API_BASE.trim();
    if (fromWindow) return fromWindow.replace(/\/$/, '');
  }

  return '';
}

function endpoint(path) {
  const base = resolveApiBase();
  return `${base}${path}`;
}

function setState(root, state) {
  root.classList.remove('live-status--loading', 'live-status--live', 'live-status--stale', 'live-status--error');
  root.classList.add(`live-status--${state}`);
}

function ensureStructure(root) {
  let left = root.querySelector('.live-status__left');
  let dot = root.querySelector('.live-status__dot');
  let title = root.querySelector('.live-status__title');
  let meta = root.querySelector('.live-status__meta');
  let updated = root.querySelector('.live-status__updated');
  let next = root.querySelector('.live-status__next');

  if (!left || !dot || !title || !meta || !updated || !next) {
    root.replaceChildren();

    left = document.createElement('div');
    left.className = 'live-status__left';

    dot = document.createElement('span');
    dot.className = 'live-status__dot';
    dot.setAttribute('aria-hidden', 'true');

    title = document.createElement('strong');
    title.className = 'live-status__title';

    left.append(dot, title);

    meta = document.createElement('div');
    meta.className = 'live-status__meta';

    updated = document.createElement('span');
    updated.className = 'live-status__updated';

    next = document.createElement('span');
    next.className = 'live-status__next';

    meta.append(updated, next);
    root.append(left, meta);
  }

  return {
    title,
    updated,
    next,
  };
}

function renderLoading(root) {
  const refs = ensureStructure(root);
  setState(root, 'loading');
  refs.title.textContent = 'Syncing status…';
  refs.updated.textContent = `Updated ${DASH}`;
  refs.next.textContent = `Next update ${DASH}`;
}

function renderError(root, message) {
  const refs = ensureStructure(root);
  setState(root, 'error');
  refs.title.textContent = 'Offline fallback';
  refs.updated.textContent = message || 'Unable to fetch /api/meta';
  refs.next.textContent = `Next update ${DASH}`;
}

function renderMeta(root, meta) {
  const refs = ensureStructure(root);
  const now = Date.now();
  const updatedMs = toMs(meta?.lastUpdated);
  const nextMs = toMs(meta?.nextUpdateAt);
  const status = meta?.status || 'error';

  const liveLike = status === 'live';
  const staleLike = status === 'stale' || status === 'bootstrapping';
  const title = liveLike ? 'Live Data' : staleLike ? 'Data Delayed' : 'Sync Error';

  setState(root, liveLike ? 'live' : staleLike ? 'stale' : 'error');
  refs.title.textContent = title;
  refs.updated.textContent = `Updated ${formatAgo(updatedMs, now)}`;
  refs.next.textContent = `Next update in ${formatNext(nextMs, now)}`;
}

async function requestMeta() {
  const response = await fetch(endpoint('/api/meta'), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`/api/meta HTTP ${response.status}`);
  }

  return response.json();
}

export function initLiveStatusBar() {
  const root = document.getElementById('live-status');
  if (!root) return;

  let latestMeta = null;
  let tickTimer = null;
  let refreshTimer = null;

  const redraw = () => {
    if (latestMeta) renderMeta(root, latestMeta);
  };

  const schedule = () => {
    tickTimer = window.setInterval(redraw, TICK_MS);
    refreshTimer = window.setInterval(async () => {
      try {
        latestMeta = await requestMeta();
        redraw();
      } catch (error) {
        console.error('[live-status] refresh failed', error);
      }
    }, REFRESH_MS);
  };

  renderLoading(root);

  requestMeta()
    .then((meta) => {
      latestMeta = meta;
      redraw();
      schedule();
    })
    .catch((error) => {
      console.error('[live-status] initial load failed', error);
      renderError(root, 'Failed to load live status');
      schedule();
    });

  window.addEventListener(
    'beforeunload',
    () => {
      if (tickTimer) window.clearInterval(tickTimer);
      if (refreshTimer) window.clearInterval(refreshTimer);
    },
    { once: true }
  );
}
