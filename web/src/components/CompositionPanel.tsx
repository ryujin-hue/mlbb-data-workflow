import { useMemo } from 'react';

import { analyzeComposition } from '../calc/composition';
import type { SlimHero } from '../data/client';
import { useLocalStore } from '../data/store';
import { formatPercent } from '../lib/format';

interface Props {
  heroes: SlimHero[];
  selected: string[];
  onRemove: (heroId: string) => void;
  onClear: () => void;
  onOpenHero: (heroId: string) => void;
}

/** Analyzer komposisi tim: 1-5 hero, skor frontline/peel/CC/objective + balance. */
export function CompositionPanel({ heroes, selected, onRemove, onClear, onOpenHero }: Props) {
  const notes = useLocalStore((s) => s.notes);
  const setNote = useLocalStore((s) => s.setNote);

  const members = useMemo(
    () => selected.map((id) => heroes.find((h) => h.id === id)).filter((h): h is SlimHero => Boolean(h)),
    [selected, heroes]
  );

  const score = useMemo(() => analyzeComposition(members), [members]);

  const bar = (label: string, value: number, variant: string) => (
    <div className="comp__bar" key={label}>
      <span>{label}</span>
      <span className="comp__track">
        <span className={`comp__fill ${variant}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="num">{formatPercent(value * 100)}</span>
    </div>
  );

  return (
    <>
      <section className="panel">
        <div className="panel__head">
          <h2>Komposisi Tim</h2>
          <span className="panel__hint">{members.length}/5 hero dipilih</span>
        </div>

        <div className="pick">
          {Array.from({ length: 5 }, (_, index) => {
            const member = members[index];
            return (
              <button
                key={index}
                type="button"
                className="pick__slot"
                onClick={() => member && onRemove(member.id)}
                title={member ? `Keluarkan ${member.name}` : 'Slot kosong'}
                style={member ? { borderStyle: 'solid' } : undefined}
              >
                {member ? (
                  <img src={member.icon_url ?? member.portrait_url ?? ''} alt={member.name} />
                ) : (
                  `${index + 1}`
                )}
              </button>
            );
          })}
          <button className="btn btn--sm" type="button" onClick={onClear} disabled={members.length === 0}>
            Kosongkan
          </button>
        </div>

        {members.length === 0 ? (
          <div className="state">
            Pilih hero dari tab Hero untuk menyusun komposisi tim. Tekan tombol pada kartu hero.
          </div>
        ) : (
          <>
            <div className="section-title">Anggota tim</div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Hero</th>
                  <th>Role</th>
                  <th className="num">WR</th>
                  <th className="num">Tier</th>
                </tr>
              </thead>
              <tbody>
                {members.map((hero) => (
                  <tr key={hero.id}>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => onOpenHero(hero.id)}
                        style={{ padding: 0, border: 0, background: 'none' }}
                      >
                        {hero.name}
                      </button>
                    </td>
                    <td>{hero.roles.join(', ')}</td>
                    <td className="num">{formatPercent(hero.win_rate)}</td>
                    <td className="num">{hero.tier ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="section-title">Sebaran tipe damage</div>
            <div className="comp__bars">
              {Object.entries(score.damage_distribution).map(([type, percent]) => (
                <div className="comp__bar" key={type}>
                  <span>{type}</span>
                  <span className="comp__track">
                    <span className="comp__fill" style={{ width: `${percent}%` }} />
                  </span>
                  <span className="num">{formatPercent(percent)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {members.length > 0 ? (
        <section className="panel">
          <div className="panel__head">
            <h2>Skor Komposisi</h2>
            <span className="panel__hint">{score.profile}</span>
          </div>

          <div className="statgrid" style={{ marginBottom: 12 }}>
            <div className="stat">
              <div className="stat__label">Balance Rating</div>
              <div className="stat__value">{score.balance_rating}</div>
              <div className="stat__note">skala 0-100</div>
            </div>
          </div>

          <div className="comp__bars">
            {bar('CC Density', score.cc_density, 'comp__fill--adv')}
            {bar('Frontline', score.frontline_score, 'comp__fill--gold')}
            {bar('Peel', score.peel_score, 'comp__fill--adv')}
            {bar('Objective', score.objective_score, 'comp__fill--thr')}
          </div>

          <div className="section-title">Catatan</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '.8rem', color: 'var(--ink-2)' }}>
            {score.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__head">
          <h2>Catatan Pribadi</h2>
          <span className="panel__hint">tersimpan lokal, tidak dikirim ke server</span>
        </div>
        {members.length === 0 ? (
          <div className="state">Pilih hero dulu untuk menulis catatan.</div>
        ) : (
          members.map((hero) => (
            <div key={hero.id} style={{ marginBottom: 10 }}>
              <label className="panel__hint" style={{ display: 'block', marginBottom: 4 }}>
                {hero.name}
              </label>
              <textarea
                value={notes[hero.id] ?? ''}
                placeholder="Catatan draft, build, counter pick…"
                onChange={(event) => setNote(hero.id, event.target.value)}
              />
            </div>
          ))
        )}
      </section>
    </>
  );
}
