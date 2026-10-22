/** Presentation helpers. Everything here degrades to an honest em dash. */

export const DASH = '—';

export function percent(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(digits)}%`;
}

export function integer(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return Math.round(value).toLocaleString('en-US');
}

/** Formats an ISO-8601 UTC stamp as a compact UTC string. */
export function utcStamp(iso) {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function dateOnly(iso) {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 10);
}

export function bytes(n) {
  if (!n || !Number.isFinite(n)) return DASH;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function signed(points, digits = 1) {
  if (points === null || points === undefined || !Number.isFinite(points)) return DASH;
  const v = points.toFixed(digits);
  return points > 0 ? `+${v}` : v;
}

/** Tier badge colour key, matching --tier-* CSS variables. */
export function tierKey(tier) {
  switch (tier) {
    case 'S+': return 'sp';
    case 'S': return 's';
    case 'A': return 'a';
    case 'B': return 'b';
    case 'C': return 'c';
    default: return null;
  }
}

export function pluralise(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}
