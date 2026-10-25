import { useCallback, useEffect, useRef, useState } from 'react';

import { API, fetchJson, type HeroDetailResponse } from '../data/client';
import { findHeroAudioTrack } from '../data/heroAudio';
import { useLocalStore } from '../data/store';
import {
  prepareHeroTrack,
  stopHeroTrack,
  subscribeHeroAudio,
  toggleHeroTrack,
  type HeroAudioState,
} from '../lib/heroAudio';
import { formatPercent } from '../lib/format';

interface Props {
  heroId: string;
  onClose: () => void;
  onAddToTeam: (heroId: string) => void;
  inTeam: boolean;
}

interface DetailHero {
  id: string;
  name: string;
  title: string | null;
  roles: string[];
  lanes: string[];
  speciality: string[];
  damage_type: string | null;
  attack_type: string | null;
  resource: string | null;
  portrait_url: string | null;
  icon_url: string | null;
  release_year: number | null;
  difficulty: number | null;
  price: number | null;
  ratings: Record<string, number | null> | null;
  base_stats: Record<string, number | null> | null;
  skills: {
    id: string;
    name: string;
    type: string;
    label: string | null;
    description: string | null;
    icon_url: string | null;
  }[];
  stats: {
    tier: string | null;
    win_rate: number | null;
    pick_rate: number | null;
    ban_rate: number | null;
    rank_scope: string | null;
    rates_by_rank: Record<
      string,
      { win_rate: number | null; pick_rate: number | null; ban_rate: number | null; tier: string | null }
    > | null;
  } | null;
}

/** Jarak jari (px) sebelum swipe bawah dianggap "tutup". */
const SWIPE_CLOSE_DISTANCE = 80;

/**
 * Profil hero.
 *
 * Desktop: modal di tengah (max 640px).
 * Mobile: bottom sheet yang covering sebahagian bawah skrin, boleh ditutup
 * dengan swipe turun.
 *
 * Menutup profil (X, backdrop, ESC, butang Kembali, swipe turun) akan
 * menghentikan lagu hero dengan fade-out ~200ms dan reset ke 0:00.
 */
export function HeroProfileModal({ heroId, onClose, onAddToTeam, inTeam }: Props) {
  const [detail, setDetail] = useState<HeroDetailResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [audio, setAudio] = useState<HeroAudioState>({
    hero: null,
    playing: false,
    hasTrack: false,
  });
  const [dragY, setDragY] = useState(0);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; x: number } | null>(null);
  const dragging = useRef(false);

  const favorites = useLocalStore((s) => s.favorites);
  const toggleFavorite = useLocalStore((s) => s.toggleFavorite);
  const notes = useLocalStore((s) => s.notes);
  const setNote = useLocalStore((s) => s.setNote);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setDetail(null);

    fetchJson<HeroDetailResponse>(API.heroDetail(heroId), { signal: controller.signal })
      .then((data) => {
        setDetail(data);
        setStatus('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });

    return () => controller.abort();
  }, [heroId]);

  // Pra-muat lagu sebaik profil dibuka (id dulu - biasanya sama dengan nama).
  useEffect(() => {
    prepareHeroTrack(heroId);
  }, [heroId]);

  // Bila profil ditutup (atau hero lain dibuka), lagu berhenti dengan fade.
  useEffect(() => {
    return () => {
      stopHeroTrack();
    };
  }, []);

  useEffect(() => subscribeHeroAudio(setAudio), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Kunci scroll halaman di belakang profil.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const hero = detail?.hero as DetailHero | undefined;
  const heroName = hero?.name ?? heroId;
  const track = findHeroAudioTrack(heroName);
  const isPlaying = audio.playing && audio.hero === heroName;

  // Kalau nama sebenar hero berbeza dengan id, pastikan lagunya ikut pra-muat.
  useEffect(() => {
    if (hero?.name) prepareHeroTrack(hero.name);
  }, [hero?.name]);

  const handleArtClick = useCallback(() => {
    if (!track) return; // hero tanpa lagu: senyap, tiada apa-apa berlaku
    toggleHeroTrack(heroName);
  }, [track, heroName]);

  // ------------------------------------------------- swipe turun (mobile)
  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const panel = panelRef.current;
    // Swipe hanya bermula dari atas panel (bukan tengah scroll).
    if (panel && panel.scrollTop > 0) return;
    dragStart.current = { y: touch.clientY, x: touch.clientX };
    dragging.current = false;
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dy = touch.clientY - dragStart.current.y;
    const dx = touch.clientX - dragStart.current.x;
    if (dy > 0 && dy > Math.abs(dx)) {
      dragging.current = true;
      setDragY(dy);
    }
  };

  const onTouchEnd = () => {
    if (!dragStart.current) return;
    const shouldClose = dragging.current && dragY >= SWIPE_CLOSE_DISTANCE;
    dragStart.current = null;
    dragging.current = false;
    setDragY(0);
    if (shouldClose) onClose();
  };

  const isFavorite = favorites.includes(heroId);

  return (
    <div
      className="profile"
      role="dialog"
      aria-modal="true"
      aria-label={`Profil ${heroName}`}
      onClick={onClose}
    >
      <div
        className="profile__panel"
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div className="profile__grip" aria-hidden="true" />

        <div className="profile__head">
          <button
            type="button"
            className={`profile__art${track ? '' : ' profile__art--silent'}`}
            onClick={handleArtClick}
            aria-label={track ? `Mainkan lagu ${heroName}` : `${heroName} belum ada lagu`}
            aria-pressed={track ? isPlaying : undefined}
            disabled={!track}
          >
            <img
              src={hero?.portrait_url ?? hero?.icon_url ?? ''}
              alt={track ? `Potret ${heroName}` : ''}
              width={88}
              height={88}
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden';
              }}
            />
            {track ? (
              <span className="profile__articon" aria-hidden="true">
                {isPlaying ? '❚❚' : '▶'}
              </span>
            ) : null}
            {track && isPlaying ? (
              <span className="eq" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            ) : null}
          </button>

          <div className="profile__id">
            <h2 className="profile__name">{heroName}</h2>
            {hero?.title ? <div className="profile__title">{hero.title}</div> : null}
            <div className="profile__role">
              {hero?.roles?.length ? hero.roles.join(' · ') : '—'}
              {hero?.damage_type ? ` · ${hero.damage_type}` : ''}
            </div>
            {hero?.stats?.tier ? (
              <span className="badge badge--tier" data-tier={hero.stats.tier}>
                {hero.stats.tier}
              </span>
            ) : null}
          </div>

          <div className="profile__actions">
            <button className="btn btn--sm profile__back" type="button" onClick={onClose}>
              ← Kembali
            </button>
            <button className="btn btn--sm profile__close" type="button" onClick={onClose} aria-label="Tutup">
              ✕
            </button>
          </div>
        </div>

        {status === 'loading' ? <div className="state">Memuat detail…</div> : null}

        {status === 'error' ? (
          <div className="state state--error">
            <p>Gagal memuat detail hero.</p>
            <p style={{ fontSize: '.76rem' }}>{error}</p>
          </div>
        ) : null}

        {status === 'ready' && hero ? (
          <>
            <div className="controls__row" style={{ marginBottom: 10 }}>
              <button
                className="btn btn--sm"
                type="button"
                onClick={() => toggleFavorite(hero.id)}
                aria-pressed={isFavorite}
              >
                {isFavorite ? '★ Favorit' : '☆ Favorit'}
              </button>
              <button className="btn btn--sm" type="button" onClick={() => onAddToTeam(hero.id)}>
                {inTeam ? 'Keluarkan dari tim' : 'Masukkan ke tim'}
              </button>
            </div>

            <div className="statgrid" style={{ marginBottom: 12 }}>
              <div className="stat">
                <div className="stat__label">Win Rate</div>
                <div className="stat__value">{formatPercent(hero.stats?.win_rate)}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Pick Rate</div>
                <div className="stat__value">{formatPercent(hero.stats?.pick_rate)}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Ban Rate</div>
                <div className="stat__value">{formatPercent(hero.stats?.ban_rate)}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Tier</div>
                <div className="stat__value">{hero.stats?.tier ?? '—'}</div>
              </div>
            </div>

            {hero.stats?.rates_by_rank ? (
              <>
                <div className="section-title">Rate per Rank</div>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th className="num">WR</th>
                      <th className="num">PR</th>
                      <th className="num">BR</th>
                      <th className="num">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(hero.stats.rates_by_rank).map(([rank, row]) => (
                      <tr key={rank}>
                        <td>{rank}</td>
                        <td className="num">{formatPercent(row.win_rate)}</td>
                        <td className="num">{formatPercent(row.pick_rate)}</td>
                        <td className="num">{formatPercent(row.ban_rate)}</td>
                        <td className="num">{row.tier ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}

            <div className="section-title">Info</div>
            <table className="tbl">
              <tbody>
                <tr>
                  <td>Role</td>
                  <td>{hero.roles.join(', ') || '—'}</td>
                </tr>
                <tr>
                  <td>Lane</td>
                  <td>{hero.lanes.join(', ') || '—'}</td>
                </tr>
                <tr>
                  <td>Tipe damage</td>
                  <td>{hero.damage_type ?? '—'}</td>
                </tr>
                <tr>
                  <td>Tipe serangan</td>
                  <td>{hero.attack_type ?? '—'}</td>
                </tr>
                <tr>
                  <td>Rilis</td>
                  <td>{hero.release_year ?? '—'}</td>
                </tr>
                <tr>
                  <td>Kesulitan</td>
                  <td>{hero.difficulty ?? '—'}</td>
                </tr>
              </tbody>
            </table>

            <div className="section-title">Skill ({hero.skills?.length ?? 0})</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {(hero.skills ?? []).map((skill) => (
                <li
                  key={skill.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '38px 1fr',
                    gap: 9,
                    padding: '7px 0',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <img
                    src={skill.icon_url ?? ''}
                    alt=""
                    width={38}
                    height={38}
                    loading="lazy"
                    style={{ borderRadius: 3, objectFit: 'cover', background: 'var(--panel-2)' }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '.84rem' }}>
                      {skill.name}
                      {skill.label ? (
                        <span className="tag" style={{ marginLeft: 6 }}>
                          {skill.label}
                        </span>
                      ) : null}
                    </div>
                    {skill.description ? (
                      <div style={{ fontSize: '.76rem', color: 'var(--ink-3)' }}>{skill.description}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <div className="section-title">Catatan</div>
            <textarea
              value={notes[hero.id] ?? ''}
              placeholder="Catatan lokal untuk hero ini…"
              onChange={(event) => setNote(hero.id, event.target.value)}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
