import { useCallback, useEffect, useMemo, useState } from 'react';

import { CompositionPanel } from './components/CompositionPanel';
import { FilterPanel } from './components/FilterPanel';
import { FilterToolbar } from './components/FilterToolbar';
import { HeroDetailDrawer } from './components/HeroDetailDrawer';
import { HeroGrid } from './components/HeroGrid';
import { MoversPanel } from './components/MoversPanel';
import { SourcesPanel } from './components/SourcesPanel';
import { StatStrip } from './components/StatStrip';
import {
  API,
  fetchOfflineFirst,
  type DeltaResponse,
  type HeroIndexResponse,
  type SnapshotMeta,
} from './data/client';
import {
  RANK_OPTIONS,
  SORT_OPTIONS,
  WINDOW_OPTIONS,
  selectHeroes,
  summarize,
  useLocalStore,
  useMetaStore,
  type View,
} from './data/store';
import { formatDateTime, formatRelative } from './lib/format';

const TABS: { id: View; label: string; icon: string }[] = [
  { id: 'heroes', label: 'Hero', icon: '◆' },
  { id: 'composition', label: 'Tim', icon: '⊞' },
  { id: 'movers', label: 'Movers', icon: '↕' },
  { id: 'sources', label: 'Data', icon: 'ⓘ' },
];

function viewFromHash(): View {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  return (TABS.find((tab) => tab.id === raw)?.id ?? 'heroes') as View;
}

export default function App() {
  const meta = useMetaStore();
  const favorites = useLocalStore((s) => s.favorites);

  const [view, setView] = useState<View>(viewFromHash);
  const [index, setIndex] = useState<HeroIndexResponse | null>(null);
  const [deltas, setDeltas] = useState<DeltaResponse | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [openHero, setOpenHero] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Tab <- hash, supaya state bisa di-share.
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goTo = useCallback((next: View) => {
    window.location.hash = `#/${next}`;
    setView(next);
    setFiltersOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  // Sheet filter mengunci scroll halaman di belakangnya.
  useEffect(() => {
    if (!filtersOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [filtersOpen]);

  // Escape menutup sheet filter.
  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtersOpen]);

  // Muat indeks hero + delta + daftar versi snapshot.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setStatus('loading');
    setError(null);

    Promise.allSettled([
      // Selalu ambil matrix lengkap (rank=all). Bracket rank dihitung ulang
      // di client, jadi ganti rank tidak memicu request ulang dan grid tidak
      // flicker.
      fetchOfflineFirst<HeroIndexResponse>(API.heroIndex('all'), {
        signal: controller.signal,
        cacheKey: 'rank:all',
      }),
      fetchOfflineFirst<DeltaResponse>(API.deltas(meta.window), {
        signal: controller.signal,
        cacheKey: `window:${meta.window}`,
      }),
      fetchOfflineFirst<{ entries: SnapshotMeta[] }>(API.snapshots(), { signal: controller.signal }),
    ])
      .then(([indexResult, deltaResult, snapshotResult]) => {
        if (cancelled) return;

        if (indexResult.status === 'fulfilled') {
          setIndex(indexResult.value.data);
          setFromCache(indexResult.value.fromCache);
        } else {
          setError(
            indexResult.reason instanceof Error ? indexResult.reason.message : String(indexResult.reason)
          );
          setStatus('error');
          return;
        }

        if (deltaResult.status === 'fulfilled') setDeltas(deltaResult.value.data);
        if (snapshotResult.status === 'fulfilled') setSnapshots(snapshotResult.value.data.entries ?? []);

        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [meta.window]);

  const deltaMap = useMemo(() => {
    const map = new Map<string, DeltaResponse['deltas'][number]>();
    for (const delta of deltas?.deltas ?? []) map.set(delta.id, delta);
    return map;
  }, [deltas]);

  const heroes = index?.heroes ?? [];

  const visible = useMemo(
    () =>
      selectHeroes({
        heroes,
        deltas: deltaMap,
        rank: meta.rank,
        query: meta.query,
        roles: meta.roles,
        lanes: meta.lanes,
        damageTypes: meta.damageTypes,
        sort: meta.sort,
        desc: meta.desc,
        threshold: meta.moverThreshold,
      }),
    [heroes, deltaMap, meta]
  );

  const stats = useMemo(
    () => summarize(heroes, index?.manifest?.rates_summary ?? null, meta.rank),
    [heroes, index?.manifest?.rates_summary, meta.rank]
  );

  const latestSnapshot = snapshots[0] ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand__mark" aria-hidden="true" />
          MLBB<span className="brand__thin">MetaCenter</span>
        </span>
        <div className="topbar__meta">
          <span
            className={`dot ${status === 'error' ? 'dot--error' : fromCache ? 'dot--stale' : ''}`}
            aria-hidden="true"
          />
          <span>
            {status === 'error'
              ? 'Gagal memuat'
              : latestSnapshot
                ? `v${latestSnapshot.version.slice(0, 10)} · ${formatRelative(latestSnapshot.stored_at)}`
                : formatRelative(index?.runtime?.storedAt ?? null)}
          </span>
        </div>
      </header>

      <nav className="tabbar" role="tablist" aria-label="Tampilan">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => goTo(tab.id)}
          >
            <span className="tab__icon" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="main">
        <div className="wrap">
          {status === 'loading' && heroes.length === 0 ? (
            <div className="panel">
              <div className="state">Memuat dataset…</div>
              {[0, 1, 2, 3, 4].map((i) => (
                <div className="skeleton" key={i} style={{ marginBottom: 8 }} />
              ))}
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="panel">
              <div className="state state--error">
                <p>Gagal memuat data dari Worker.</p>
                <p style={{ fontSize: '.78rem' }}>{error}</p>
                <button className="btn btn--primary" type="button" onClick={() => window.location.reload()}>
                  Muat ulang
                </button>
              </div>
            </div>
          ) : null}

          {status !== 'loading' && heroes.length > 0 ? (
            <>
              {fromCache ? (
                <div className="notice">
                  Mode offline: menampilkan snapshot tersimpan terakhir. Data mungkin belum paling baru.
                </div>
              ) : null}

              {view === 'heroes' ? (
                <>
                  <FilterToolbar
                    rankOptions={RANK_OPTIONS}
                    windowOptions={WINDOW_OPTIONS}
                    sortOptions={SORT_OPTIONS}
                    resultCount={visible.length}
                    activeFilters={
                      meta.roles.length + meta.lanes.length + meta.damageTypes.length
                    }
                    onOpenFilters={() => setFiltersOpen(true)}
                  />

                  <div className="heroes-layout">
                    <FilterPanel
                      heroes={heroes}
                      open={filtersOpen}
                      onClose={() => setFiltersOpen(false)}
                    />

                    <StatStrip stats={stats} rank={meta.rank} />
                  </div>

                  <HeroGrid
                    heroes={visible}
                    favorites={favorites}
                    selected={meta.composition}
                    onOpen={setOpenHero}
                    onToggleSelect={meta.toggleComposition}
                  />
                </>
              ) : null}

              {view === 'composition' ? (
                <CompositionPanel
                  heroes={heroes}
                  selected={meta.composition}
                  onRemove={meta.toggleComposition}
                  onClear={meta.clearComposition}
                  onOpenHero={setOpenHero}
                />
              ) : null}

              {view === 'movers' ? (
                <MoversPanel
                  deltas={deltas}
                  threshold={meta.moverThreshold}
                  onThreshold={meta.setMoverThreshold}
                  windowOptions={WINDOW_OPTIONS}
                  window={meta.window}
                  onWindow={meta.setWindow}
                />
              ) : null}

              {view === 'sources' ? (
                <SourcesPanel manifest={index?.manifest ?? null} snapshots={snapshots} />
              ) : null}
            </>
          ) : null}
        </div>
      </main>

      <footer className="footer">
        <div className="wrap">
          <p>
            Data:{' '}
            <a href="https://github.com/achedon12/mlbb" target="_blank" rel="noreferrer noopener">
              MLBBDex mirror
            </a>{' '}
            (CC BY-SA 4.0 via Mobile Legends Wiki). Diperbarui{' '}
            {formatDateTime(latestSnapshot?.measured_at_utc ?? index?.manifest?.generated_at_utc ?? null)} UTC.
            Tidak berafiliasi dengan Moonton.
          </p>
        </div>
      </footer>

      {openHero ? (
        <HeroDetailDrawer
          heroId={openHero}
          onClose={() => setOpenHero(null)}
          onAddToTeam={(id) => meta.toggleComposition(id)}
          inTeam={meta.composition.includes(openHero)}
        />
      ) : null}
    </div>
  );
}
