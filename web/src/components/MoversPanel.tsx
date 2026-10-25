import type { DeltaResponse, HeroDelta } from '../data/client';
import { formatPercent, formatTierScore } from '../lib/format';

interface Props {
  deltas: DeltaResponse | null;
  threshold: number;
  onThreshold: (value: number) => void;
  windowOptions: readonly { value: string; label: string }[];
  window: string;
  onWindow: (value: string) => void;
  /** Buka profil hero (satu klik pada nama). */
  onOpen: (heroId: string) => void;
}

function Row({
  delta,
  index,
  onOpen,
}: {
  delta: HeroDelta;
  index: number;
  onOpen: (heroId: string) => void;
}) {
  const up = (delta.tier_score_delta ?? 0) >= 0;
  return (
    <div className="mover">
      <span className="mover__rank">{index + 1}</span>
      <span>
        <button type="button" className="mover__name" onClick={() => onOpen(delta.id)}>
          {delta.name}
        </button>
        <span style={{ color: 'var(--ink-3)', marginLeft: 6, fontSize: '.74rem' }}>
          {delta.tier ?? '—'} · WR {formatPercent(delta.win_rate)} (Δ{formatTierScore(delta.win_rate_delta)})
        </span>
      </span>
      <span className={up ? 'trend trend--up' : 'trend trend--down'}>
        {up ? '▲' : '▼'} {formatTierScore(delta.tier_score_delta)}
      </span>
    </div>
  );
}

/** Meta Movers: hero yang paling naik / turun dibanding snapshot pembanding. */
export function MoversPanel({
  deltas,
  threshold,
  onThreshold,
  windowOptions,
  window: windowValue,
  onWindow,
  onOpen,
}: Props) {
  return (
    <>
      <section className="panel">
        <div className="panel__head">
          <h2>Meta Movers</h2>
          <span className="panel__hint">
            {deltas ? `${deltas.from.version.slice(0, 10)} → ${deltas.to.version.slice(0, 10)}` : '—'}
          </span>
        </div>

        <div className="controls__row" style={{ marginBottom: 10 }}>
          <label>
            <span>Periode</span>
            <select value={windowValue} onChange={(e) => onWindow(e.target.value)}>
              {windowOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Ambang delta (poin)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={threshold}
              onChange={(e) => onThreshold(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        {!deltas ? (
          <div className="state">Memuat riwayat snapshot…</div>
        ) : deltas.available === false ? (
          <div className="state">
            {deltas.message ??
              'Belum ada riwayat snapshot untuk dibandingkan. Worker menyimpan satu versi per refresh harian; butuh minimal dua versi.'}
          </div>
        ) : (
          <>
            <div className="statgrid" style={{ marginBottom: 10 }}>
              <div className="stat">
                <div className="stat__label">Naik</div>
                <div className="stat__value">{deltas.rising.length}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Turun</div>
                <div className="stat__value">{deltas.falling.length}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Stabil</div>
                <div className="stat__value">{deltas.steady}</div>
              </div>
              <div className="stat">
                <div className="stat__label">Hero Baru</div>
                <div className="stat__value">{deltas.new_heroes.length}</div>
              </div>
            </div>

            <div className="movers-grid">
              <div>
                <div className="section-title" style={{ marginTop: 0 }}>
                  Biggest Risers
                </div>
                {deltas.rising.length === 0 ? (
                  <div className="state">Tidak ada hero yang naik melewati ambang.</div>
                ) : (
                  deltas.rising.map((delta, index) => (
                    <Row key={delta.id} delta={delta} index={index} onOpen={onOpen} />
                  ))
                )}
              </div>
              <div>
                <div className="section-title" style={{ marginTop: 0 }}>
                  Biggest Fallers
                </div>
                {deltas.falling.length === 0 ? (
                  <div className="state">Tidak ada hero yang turun melewati ambang.</div>
                ) : (
                  deltas.falling.map((delta, index) => (
                    <Row key={delta.id} delta={delta} index={index} onOpen={onOpen} />
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
