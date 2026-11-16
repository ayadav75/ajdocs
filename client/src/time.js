const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];

// "3 minutes ago", "yesterday"; pair with title={full(t)} so the exact time is still available.
export function ago(t) {
  const s = (new Date(t) - Date.now()) / 1000;
  for (const [unit, n] of UNITS) if (Math.abs(s) >= n) return rtf.format(Math.trunc(s / n), unit);
  return 'just now';
}

export const full = (t) => new Date(t).toLocaleString();
