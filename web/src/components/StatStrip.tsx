import { formatPercent } from '../lib/format';

export interface Summary {
  avgWinRate: number | null;
  avgWinRateByRole: Record<string, number>;
  mostBanned: { id: string; name: string; value: number } | null;
  mostPicked: { id: string; name: string; value: number } | null;
  rated: number;
  total: number;
}

const RANK_LABELS: Record<string, string> = {
  all: 'All Ranks',
  epic: 'Epic',
  legend: 'Legend',
  mythic: 'Mythic',
  honor: 'Honor',
  glory: 'Mythical Glory',
};

/**
 * Strip ringkasan meta: rata-rata win rate, hero paling di-ban, hero paling
 * di-pick, dan jumlah hero yang punya rate.
 */
export function StatStrip({ stats, rank }: { stats: Summary; rank: string }) {
  const roles = Object.entries(stats.avgWinRateByRole).sort((a, b) => b[1] - a[1]);
  const max = roles[0]?.[1] ?? 0;
  const min = roles[roles.length - 1]?.[1] ?? 0;

  return (
    <>
      <section className="panel" aria-label="Ringkasan meta">
        <div className="panel__head">
          <h2>Ringkasan Patch</h2>
          <span className="panel__hint">{RANK_LABELS[rank] ?? rank}</span>
        </div>

        <div className="statgrid">
          <div className="stat">
            <div className="stat__label">Rata-rata Win Rate</div>
            <div className="stat__value">{formatPercent(stats.avgWinRate)}</div>
            <div className="stat__note">{stats.rated} hero ber-rate</div>
          </div>

          <div className="stat">
            <div className="stat__label">Paling Banyak di-Ban</div>
            <div className="stat__value stat__value--sm">
              {stats.mostBanned ? stats.mostBanned.name : '—'}
            </div>
            <div className="stat__note">{formatPercent(stats.mostBanned?.value ?? null)} ban rate</div>
          </div>

          <div className="stat">
            <div className="stat__label">Paling Banyak di-Pick</div>
            <div className="stat__value stat__value--sm">
              {stats.mostPicked ? stats.mostPicked.name : '—'}
            </div>
            <div className="stat__note">{formatPercent(stats.mostPicked?.value ?? null)} pick rate</div>
          </div>

          <div className="stat">
            <div className="stat__label">Total Hero</div>
            <div className="stat__value">{stats.total}</div>
            <div className="stat__note">{stats.total - stats.rated} tanpa rate</div>
          </div>
        </div>

        {roles.length > 0 ? (
          <>
            <div className="section-title">Rata-rata Win Rate per Role</div>
            <div className="comp__bars">
              {roles.map(([role, value]) => (
                <div className="comp__bar" key={role}>
                  <span>{role}</span>
                  <span className="comp__track">
                    <span
                      className="comp__fill comp__fill--gold"
                      style={{
                        width: `${max > min ? ((value - min) / (max - min)) * 100 : 100}%`,
                      }}
                    />
                  </span>
                  <span className="num">{formatPercent(value)}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
