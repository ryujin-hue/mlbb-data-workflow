import { formatPercent } from '../lib/format';

export interface Summary {
  avgWinRate: number | null;
  avgWinRateByRole: Record<string, number>;
  mostBanned: { id: string; name: string; value: number } | null;
  mostPicked: { id: string; name: string; value: number } | null;
  rated: number;
  total: number;
  serverAvgWinRate?: number | null;
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
 * Ringkasan meta: rata-rata win rate, hero paling di-ban, paling di-pick,
 * jumlah hero, dan rata-rata win rate per role.
 *
 * Bar role digambar BERGASANG dari titik 50%, bukan dari 0. Rentang data
 * cuma ~3 poin (48,8 - 51,7), jadi bar 0-100% selalu terlihat penuh dan
 * tidak membawa informasi apa pun. Yang penting justru selisihnya terhadap
 * rata-rata 50%.
 */
export function StatStrip({
  stats,
  rank,
  onOpen,
}: {
  stats: Summary;
  rank: string;
  /** Buka profil hero bila nama diklik. */
  onOpen?: (heroId: string) => void;
}) {
  const roles = Object.entries(stats.avgWinRateByRole).sort((a, b) => b[1] - a[1]);

  // Skala diverging: 50% di tengah, lebar setengah track = deviasi terbesar.
  const maxDev = Math.max(
    0.4,
    ...roles.map(([, value]) => Math.abs(value - 50))
  );

  return (
    <section className="panel" aria-label="Ringkasan meta">
      <div className="panel__head">
        <h2>Ringkasan Patch</h2>
        <span className="panel__hint">{RANK_LABELS[rank] ?? rank}</span>
      </div>

      <div className="statgrid">
        <div className="kpi">
          <div className="kpi__label">Rata-rata Win Rate</div>
          <div className="kpi__value">{formatPercent(stats.avgWinRate)}</div>
          <div className="kpi__note">{stats.rated} hero ber-rate</div>
        </div>

        <div className="kpi">
          <div className="kpi__label">Paling Banyak di-Ban</div>
          <div className="kpi__value kpi__value--sm">
            {stats.mostBanned ? (
              <button type="button" className="linkish" onClick={() => onOpen?.(stats.mostBanned!.id)}>
                {stats.mostBanned.name}
              </button>
            ) : (
              '–'
            )}
          </div>
          <div className="kpi__note">{formatPercent(stats.mostBanned?.value ?? null)} ban rate</div>
        </div>

        <div className="kpi">
          <div className="kpi__label">Paling Banyak di-Pick</div>
          <div className="kpi__value kpi__value--sm">
            {stats.mostPicked ? (
              <button type="button" className="linkish" onClick={() => onOpen?.(stats.mostPicked!.id)}>
                {stats.mostPicked.name}
              </button>
            ) : (
              '–'
            )}
          </div>
          <div className="kpi__note">{formatPercent(stats.mostPicked?.value ?? null)} pick rate</div>
        </div>

        <div className="kpi">
          <div className="kpi__label">Total Hero</div>
          <div className="kpi__value">{stats.total}</div>
          <div className="kpi__note">{stats.total - stats.rated} tanpa rate</div>
        </div>
      </div>

      {roles.length > 0 ? (
        <>
          <div className="section-title">Rata-rata Win Rate per Role</div>
          <div className="roles">
            {roles.map(([role, value]) => {
              const dev = value - 50;
              const up = dev >= 0;
              const width = Math.min(50, (Math.abs(dev) / maxDev) * 50);
              return (
                <div className="role" key={role}>
                  <span className="role__name">{role}</span>
                  <span className="role__track">
                    <span className="role__mid" aria-hidden="true" />
                    <span
                      className={up ? 'role__fill' : 'role__fill role__fill--down'}
                      style={up ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
                    />
                  </span>
                  <span className="role__val">{formatPercent(value)}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
