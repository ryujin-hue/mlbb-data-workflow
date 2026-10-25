import type { SlimHero } from '../data/client';
import { useMetaStore } from '../data/store';

interface Props {
  heroes: SlimHero[];
  open: boolean;
  onClose: () => void;
}

const DAMAGE_TYPES = ['Physical', 'Magic', 'Mixed', 'Unknown'];

/**
 * Filter lanjutan: role, lane, tipe damage.
 *
 * Di HP ini jadi bottom sheet - 15 chip bertumpuk akan memenuhi satu layar
 * penuh sebelum daftar hero kelihatan. Di desktop berubah jadi panel statis
 * tiga kolom (lewat CSS).
 */
export function FilterPanel({ heroes, open, onClose }: Props) {
  const meta = useMetaStore();

  const roles = [...new Set(heroes.flatMap((h) => h.roles))].sort();
  const lanes = [...new Set(heroes.flatMap((h) => h.lanes))].sort();
  const activeCount = meta.roles.length + meta.lanes.length + meta.damageTypes.length;

  return (
    <div
      className={open ? 'sheet' : 'sheet sheet--closed'}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet__panel" role="dialog" aria-label="Filter lanjutan" aria-modal={open}>
        <div className="sheet__grip" aria-hidden="true" />

        <div className="sheet__head">
          <h2>Filter</h2>
          {activeCount > 0 ? <span className="panel__hint">{activeCount} aktif</span> : null}
          <button
            type="button"
            className="btn btn--sm drawer__close"
            onClick={onClose}
            aria-label="Tutup filter"
          >
            Tutup
          </button>
        </div>

        <div className="sheet__grid">
          <div>
            <div className="section-title">Role</div>
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

        <div className="sheet__foot">
          <button type="button" className="btn" onClick={() => meta.clearFilters()}>
            Reset
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Terapkan
          </button>
        </div>
      </div>
    </div>
  );
}
