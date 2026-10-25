import type { SortKey } from '../data/store';
import { useMetaStore } from '../data/store';

interface Props {
  rankOptions: readonly { value: string; label: string }[];
  windowOptions: readonly { value: string; label: string }[];
  sortOptions: { value: string; label: string }[];
  resultCount: number;
  activeFilters: number;
  onOpenFilters: () => void;
}

/**
 * Toolbar sticky di atas daftar hero.
 *
 * Dua kontrol yang paling sering dipakai (rank dan urutan) SELALU terlihat,
 * di HP maupun desktop. Filter yang lebih banyak (role, lane, tipe damage)
 * pindah ke bottom sheet supaya daftar hero tidak terdorong jauh ke bawah.
 *
 * Urutan DOM select sengaja: rank -> periode -> urutkan.
 */
export function FilterToolbar({
  rankOptions,
  windowOptions,
  sortOptions,
  resultCount,
  activeFilters,
  onOpenFilters,
}: Props) {
  const meta = useMetaStore();

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <div className="toolbar__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={meta.query}
            placeholder="Cari hero…"
            aria-label="Cari hero"
            onChange={(e) => meta.setQuery(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn btn--sm"
          onClick={() => meta.toggleSortDirection()}
          aria-label="Ubah arah pengurutan"
        >
          {meta.desc ? '↓' : '↑'}
        </button>

        <button
          type="button"
          className="btn btn--icon toolbar__filter"
          onClick={onOpenFilters}
          aria-label="Buka filter lanjutan"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
            <path d="M3 6h18M6 12h12M10 18h4" strokeLinecap="round" />
          </svg>
          Filter
          {activeFilters > 0 ? <span className="btn__badge">{activeFilters}</span> : null}
        </button>
      </div>

      <div className="toolbar__row toolbar__scroll">
        <select
          value={meta.rank}
          aria-label="Rank"
          onChange={(e) => meta.setRank(e.target.value)}
          style={{ width: 'auto', minWidth: 94 }}
        >
          {rankOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={meta.window}
          aria-label="Periode"
          onChange={(e) => meta.setWindow(e.target.value)}
          style={{ width: 'auto', minWidth: 70 }}
        >
          {windowOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={meta.sort}
          aria-label="Urutkan"
          onChange={(e) => meta.setSort(e.target.value as SortKey)}
          style={{ width: 'auto', minWidth: 94 }}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <span className="toolbar__count">{resultCount} hero</span>
      </div>
    </div>
  );
}
