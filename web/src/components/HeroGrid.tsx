import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { FilteredHero } from '../data/store';
import { formatPercent, formatTierScore } from '../lib/format';

interface Props {
  heroes: FilteredHero[];
  favorites: string[];
  selected: string[];
  onOpen: (heroId: string) => void;
  onToggleSelect: (heroId: string) => void;
}

const ROW_ESTIMATE = 78;
const MIN_CARD_WIDTH = 210;

function TrendBadge({ delta, trend }: { delta: number | null; trend: string | null }) {
  if (trend === 'rising') {
    return <span className="trend trend--up">▲ +{formatTierScore(delta)}</span>;
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
 * Baris = beberapa kartu, jumlah kolom dihitung dari lebar container.
 * Hanya baris yang terlihat (plus overscan) yang dirender, jadi daftar 134
 * hero tetap ringan di HP.
 */
export function HeroGrid({ heroes, favorites, selected, onOpen, onToggleSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const measure = () => {
      const width = node.clientWidth - 16;
      setColumns(Math.max(1, Math.min(6, Math.floor(width / MIN_CARD_WIDTH))));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => {
    const out: FilteredHero[][] = [];
    for (let i = 0; i < heroes.length; i += columns) {
      out.push(heroes.slice(i, i + columns));
    }
    return out;
  }, [heroes, columns]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 6,
  });

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
    <div className="vgrid" ref={scrollRef}>
      <div className="vgrid__inner" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          return (
            <div
              key={virtualRow.key}
              className="vrow"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="vrow__inner">
                {row.map((hero) => (
                  <article
                    key={hero.id}
                    className={[
                      'hcard',
                      favSet.has(hero.id) ? 'hcard--fav' : '',
                      selectedSet.has(hero.id) ? 'hcard--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => onToggleSelect(hero.id)}
                      aria-pressed={selectedSet.has(hero.id)}
                      aria-label={`${selectedSet.has(hero.id) ? 'Keluarkan' : 'Masukkan'} ${hero.name} ke komposisi tim`}
                      style={{ flex: 'none', padding: 0, border: 0, background: 'none', minHeight: 0 }}
                    >
                      <img
                        className="hcard__portrait"
                        src={hero.icon_url ?? hero.portrait_url ?? ''}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width={46}
                        height={46}
                        onError={(event) => {
                          event.currentTarget.style.visibility = 'hidden';
                        }}
                      />
                    </button>

                    <div className="hcard__body">
                      <div className="hcard__name">
                        <button
                          type="button"
                          onClick={() => onOpen(hero.id)}
                          style={{
                            background: 'none',
                            border: 0,
                            padding: 0,
                            color: 'inherit',
                            font: 'inherit',
                            fontWeight: 700,
                            cursor: 'pointer',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
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

                      <div className="hcard__tags">
                        {hero.roles.slice(0, 2).map((role) => (
                          <span className="tag" key={role}>
                            {role}
                          </span>
                        ))}
                        {hero.damage_type ? <span className="tag">{hero.damage_type}</span> : null}
                      </div>

                      <div className="hcard__rates">
                        <span>
                          WR <b>{formatPercent(hero.win_rate)}</b>
                        </span>
                        <span>
                          PR <b>{formatPercent(hero.pick_rate)}</b>
                        </span>
                        <span>
                          BR <b>{formatPercent(hero.ban_rate)}</b>
                        </span>
                        <span>
                          TS <b>{formatTierScore(hero.tier_score)}</b>
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
