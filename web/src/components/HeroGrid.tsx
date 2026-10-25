import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

import type { FilteredHero } from '../data/store';
import { formatPercent, formatTierScore } from '../lib/format';

interface Props {
  heroes: FilteredHero[];
  favorites: string[];
  selected: string[];
  onOpen: (heroId: string) => void;
  onToggleSelect: (heroId: string) => void;
}

/**
 * Jumlah kolom per lebar viewport. Harus SAMA PERSIS dengan breakpoint di
 * `styles.css` (`.vrow__inner`), karena baris virtualizer dipecah di JS
 * sementara kolom digambar oleh CSS.
 */
const COLUMN_BREAKPOINTS = [
  { minWidth: 1400, columns: 6 },
  { minWidth: 1120, columns: 5 },
  { minWidth: 900, columns: 4 },
  { minWidth: 600, columns: 3 },
  { minWidth: 0, columns: 2 },
] as const;

const ROW_ESTIMATE = 132;

function columnsFor(width: number): number {
  for (const bp of COLUMN_BREAKPOINTS) {
    if (width >= bp.minWidth) return bp.columns;
  }
  return 2;
}

/** Tanpa data -> en dash, bukan em dash, supaya bedanya kelihatan dari "-". */
function rate(value: number | null): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '–' : formatPercent(value);
}

function TrendBadge({ delta, trend }: { delta: number | null; trend: string | null }) {
  if (trend === 'rising') {
    return <span className="trend trend--up">▲ {formatTierScore(delta)}</span>;
  }
  if (trend === 'falling') {
    return <span className="trend trend--down">▼ {formatTierScore(delta)}</span>;
  }
  if (trend === 'new') {
    return <span className="trend trend--flat">BARU</span>;
  }
  return null;
}

/**
 * Grid hero dengan virtualisasi.
 *
 * Virtualizer memakai SCROLL WINDOW, bukan container sendiri. Alasannya:
 * panel dengan `overflow:auto` di dalam halaman yang juga scroll bikin
 * "scroll dalam scroll" - di HP itu terasa_rx。一旦 halaman yang scroll,
 * daftar hero bisa ikut mengalir seperti konten biasa.
 *
 * Tinggi baris diukur dinamis (`measureElement`) karena isi kartu bisa
 * beda tinggi (nama panjang wrap, badge tren muncul/tidak). Kalau tinggi
 * baris dikunci, baris berikutnya menimpa isi baris yang lebih tinggi -
 * angka BR/TS sempat hilang karena itu.
 */
export function HeroGrid({ heroes, favorites, selected, onOpen, onToggleSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) return;

    const measure = () => {
      setColumns(columnsFor(node.clientWidth));
      setScrollMargin(node.offsetTop);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const rows = useMemo(() => {
    const out: FilteredHero[][] = [];
    for (let i = 0; i < heroes.length; i += columns) {
      out.push(heroes.slice(i, i + columns));
    }
    return out;
  }, [heroes, columns]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 6,
    scrollMargin,
    gap: 0,
  });

  // Kalau hasil filter berubah, bring user balik ke awal daftar supaya hero
  // pertama hasil pencarian langsung terlihat (bukan jauh di bawah layar).
  const firstId = heroes[0]?.id ?? null;
  useEffect(() => {
    if (!firstId) return;
    const node = listRef.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - 120;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }, [firstId, heroes.length]);

  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  if (heroes.length === 0) {
    return (
      <div className="state">
        <p>Tidak ada hero yang cocok dengan filter.</p>
        <p>Coba longgarkan filter rank, role, lane, atau pencarian.</p>
      </div>
    );
  }

  return (
    <div className="vgrid" ref={listRef}>
      <div className="vgrid__inner" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="vrow"
              style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
            >
              <div className="vrow__inner">
                {row.map((hero) => {
                  const isSelected = selectedSet.has(hero.id);
                  return (
                    <article
                      key={hero.id}
                      className={[
                        'hcard',
                        favSet.has(hero.id) ? 'hcard--fav' : '',
                        isSelected ? 'hcard--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <button
                        type="button"
                        className="hcard__add"
                        aria-pressed={isSelected}
                        aria-label={`${isSelected ? 'Keluarkan' : 'Masukkan'} ${hero.name} ke komposisi tim`}
                        onClick={() => onToggleSelect(hero.id)}
                      >
                        {isSelected ? '✓' : '+'}
                      </button>

                      <div className="hcard__top">
                        <img
                          className="hcard__portrait"
                          src={hero.icon_url ?? hero.portrait_url ?? ''}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={42}
                          height={42}
                          onError={(event) => {
                            event.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                        <div className="hcard__id">
                          <div className="hcard__name">
                            <button type="button" onClick={() => onOpen(hero.id)}>
                              {hero.name}
                            </button>
                            {hero.tier ? (
                              <span className="badge badge--tier" data-tier={hero.tier}>
                                {hero.tier}
                              </span>
                            ) : null}
                            {favSet.has(hero.id) ? (
                              <span className="fav-star" aria-label="Favorit">
                                ★
                              </span>
                            ) : null}
                            <TrendBadge delta={hero.delta?.tier_score_delta ?? null} trend={hero.trend} />
                          </div>
                          <div className="hcard__meta">
                            {hero.roles.slice(0, 2).join(' · ') || '—'}
                            {hero.damage_type ? ` · ${hero.damage_type}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="hcard__rates">
                        <div className="metric">
                          <div className="metric__k">WR</div>
                          <div className="metric__v">{rate(hero.win_rate)}</div>
                        </div>
                        <div className="metric">
                          <div className="metric__k">PR</div>
                          <div className="metric__v">{rate(hero.pick_rate)}</div>
                        </div>
                        <div className="metric">
                          <div className="metric__k">BR</div>
                          <div className="metric__v">{rate(hero.ban_rate)}</div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
