import { useEffect, useState } from 'react';

import { API, fetchJson, type HeroDetailResponse } from '../data/client';
import { useLocalStore } from '../data/store';
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
  skills: { id: string; name: string; type: string; label: string | null; description: string | null; icon_url: string | null }[];
  stats: {
    tier: string | null;
    win_rate: number | null;
    pick_rate: number | null;
    ban_rate: number | null;
    rank_scope: string | null;
    rates_by_rank: Record<string, { win_rate: number | null; pick_rate: number | null; ban_rate: number | null; tier: string | null }> | null;
  } | null;
}

/** Drawer detail hero - dimuat terpisah supaya payload utama tetap ramping. */
export function HeroDetailDrawer({ heroId, onClose, onAddToTeam, inTeam }: Props) {
  const [detail, setDetail] = useState<HeroDetailResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hero = detail?.hero as DetailHero | undefined;
  const isFavorite = favorites.includes(heroId);

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label={`Detail ${heroId}`} onClick={onClose}>
      <div className="drawer__panel" onClick={(event) => event.stopPropagation()}>
        <div className="drawer__head">
          <img src={hero?.icon_url ?? hero?.portrait_url ?? ''} alt="" width={56} height={56} />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{hero?.name ?? heroId}</h2>
            {hero?.title ? (
              <div style={{ fontSize: '.74rem', color: 'var(--ink-3)' }}>{hero.title}</div>
            ) : null}
          </div>
          <button className="btn btn--sm drawer__close" type="button" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>

        {status === 'loading' ? (
          <div className="state">Memuat detail…</div>
        ) : null}

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
