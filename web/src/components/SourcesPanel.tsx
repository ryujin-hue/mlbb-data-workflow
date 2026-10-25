import type { SnapshotMeta } from '../data/client';
import { formatDateTime, formatRelative } from '../lib/format';

interface Props {
  manifest: {
    schema_version: string;
    generated_at_utc: string;
    game_patch: string | null;
    counts: Record<string, number>;
    sources: { name: string; url: string; license: string; retrieved_at_utc: string }[];
    warnings: string[];
  } | null;
  snapshots: SnapshotMeta[];
}

/** Data transparency: versi dataset, timestamp, sumber, dan warning. */
export function SourcesPanel({ manifest, snapshots }: Props) {
  return (
    <>
      <section className="panel">
        <div className="panel__head">
          <h2>Status Data</h2>
          <span className="panel__hint">schema {manifest?.schema_version ?? '—'}</span>
        </div>

        {!manifest ? (
          <div className="state">Manifest belum termuat.</div>
        ) : (
          <div className="statgrid">
            <div className="stat">
              <div className="stat__label">Terukur</div>
              <div className="stat__value stat__value--sm">{formatDateTime(manifest.generated_at_utc)}</div>
              <div className="stat__note">UTC</div>
            </div>
            <div className="stat">
              <div className="stat__label">Snapshot terbaru</div>
              <div className="stat__value stat__value--sm">
                {snapshots[0] ? formatRelative(snapshots[0].stored_at) : '—'}
              </div>
              <div className="stat__note">{snapshots.length} versi tersimpan</div>
            </div>
            <div className="stat">
              <div className="stat__label">Hero</div>
              <div className="stat__value">{manifest.counts.heroes ?? 0}</div>
              <div className="stat__note">{manifest.counts.rated_heroes ?? 0} punya rate</div>
            </div>
            <div className="stat">
              <div className="stat__label">Counter Edge</div>
              <div className="stat__value">{manifest.counts.counter_edges ?? 0}</div>
              <div className="stat__note">{manifest.counts.items ?? 0} item</div>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Sumber</h2>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Lisensi</th>
              <th>Diambil</th>
            </tr>
          </thead>
          <tbody>
            {(manifest?.sources ?? []).map((source) => (
              <tr key={source.url}>
                <td>
                  <a href={source.url} target="_blank" rel="noreferrer noopener">
                    {source.name}
                  </a>
                </td>
                <td>{source.license}</td>
                <td>{formatDateTime(source.retrieved_at_utc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Riwayat Snapshot</h2>
          <span className="panel__hint">{snapshots.length} versi</span>
        </div>
        {snapshots.length === 0 ? (
          <div className="state">Belum ada versi snapshot tersimpan.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Versi</th>
                <th>Disimpan</th>
                <th className="num">Hero</th>
                <th className="num">Ber-rate</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={snapshot.version}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '.72rem' }}>{snapshot.version}</td>
                  <td>{formatDateTime(snapshot.stored_at)}</td>
                  <td className="num">{snapshot.counts.heroes}</td>
                  <td className="num">{snapshot.counts.rated_heroes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {manifest && manifest.warnings.length > 0 ? (
        <section className="panel">
          <div className="panel__head">
            <h2>Warning Dataset</h2>
            <span className="panel__hint">{manifest.warnings.length} entri</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '.74rem', color: 'var(--ink-3)' }}>
            {manifest.warnings.slice(0, 40).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
