import type { SlimHero } from '../data/client';
import { useMetaStore } from '../data/store';

interface Props {
  rankOptions: readonly { value: string; label: string }[];
  windowOptions: readonly { value: string; label: string }[];
  sortOptions: { value: string; label: string }[];
  heroes: SlimHero[];
}

const DAMAGE_TYPES = ['Physical', 'Magic', 'Mixed', 'Unknown'];

/** Filter: rank, window, pencarian, role, lane, damage type, dan sorting. */
export function FilterPanel({ rankOptions, windowOptions, sortOptions, heroes }: Props) {
  const meta = useMetaStore();

  const roles = [...new Set(heroes.flatMap((h) => h.roles))].sort();
  const lanes = [...new Set(heroes.flatMap((h) => h.lanes))].sort();

  return (
    <section className="panel" aria-label="Filter">
      <div className="controls">
        <div className="controls__row">
          <label>
            <span>Rank</span>
            <select value={meta.rank} onChange={(e) => meta.setRank(e.target.value)}>
              {rankOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Periode</span>
            <select value={meta.window} onChange={(e) => meta.setWindow(e.target.value)}>
              {windowOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Urutkan</span>
            <select value={meta.sort} onChange={(e) => meta.setSort(e.target.value as never)}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="controls__row">
          <label style={{ flexBasis: '100%' }}>
            <span>Cari hero</span>
            <input
              type="search"
              value={meta.query}
              placeholder="Nama hero, role, atau speciality…"
              onChange={(e) => meta.setQuery(e.target.value)}
            />
          </label>
        </div>

        <div>
          <div className="section-title" style={{ marginTop: 0 }}>
            Role
          </div>
          <div className="chips">
            {roles.map((role) => (
              <button
                key={role}
                type="button"
                className="chip"
                aria-pressed={meta.roles.includes(role)}
                onClick={() => meta.toggleRole(role)}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="section-title">Lane</div>
          <div className="chips">
            {lanes.map((lane) => (
              <button
                key={lane}
                type="button"
                className="chip"
                aria-pressed={meta.lanes.includes(lane)}
                onClick={() => meta.toggleLane(lane)}
              >
                {lane}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="section-title">Tipe Damage</div>
          <div className="chips">
            {DAMAGE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="chip"
                aria-pressed={meta.damageTypes.includes(type)}
                onClick={() => meta.toggleDamageType(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
