const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const nf = (n: number): string => n.toLocaleString('en-US');
export const money = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');
export const pct = (a: number, b: number): string => (b ? (a / b * 100).toFixed(1) : '0.0') + '%';
export const titleCase = (s: string): string => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
export const monthKey = (d: Date): string => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-');
  return MON[Number(m) - 1] + ' ’' + y.slice(2);
};
export const monthShort = (key: string): string => MON[Number(key.split('-')[1]) - 1];

export const fmtDate = (d: Date | null): string => d && !isNaN(d.getTime())
  ? String(d.getDate()).padStart(2, '0') + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear()
  : '—';

export const fmtTime = (d: Date | null): string => {
  if (!d || isNaN(d.getTime())) return '';
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return String(h).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
};

/** Backend UTC timestamp -> "19/Oct/2026 01:41 PM IST" in the site's time zone, as the admin
 *  panel shows it (its uTCianaBasedDateConversion pipe). */
export function siteDateTime(utc: string | Date | null | undefined, iana?: string | null): { date: string; time: string; full: string } {
  if (!utc) return { date: '—', time: '', full: '—' };
  let d: Date;
  if (utc instanceof Date) d = utc;
  else {
    const s = String(utc).trim().replace(' ', 'T');
    d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
  }
  if (isNaN(d.getTime())) return { date: '—', time: '', full: '—' };
  const tz = iana || 'Asia/Kolkata';
  const part = (locale: string) => {
    try {
      const p = new Intl.DateTimeFormat(locale, { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZoneName: 'short' }).formatToParts(d);
      return (t: string) => p.find(x => x.type === t)?.value || '';
    } catch {
      return null;
    }
  };
  let get = part('en-US');
  if (!get) return { date: fmtDate(d), time: fmtTime(d), full: fmtDate(d) + ' ' + fmtTime(d) };
  // en-US prints India as GMT+5:30; en-IN names it IST like the admin panel does.
  if (/^GMT/.test(get('timeZoneName'))) get = part('en-IN') || get;
  const date = `${get('day')}/${get('month')}/${get('year')}`;
  const time = `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()} ${get('timeZoneName')}`;
  return { date, time, full: date + ' ' + time };
}

export const isoDate =(d: Date): string =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/** The 12 calendar months up to this one, oldest first, as yyyy-mm keys. */
export function lastTwelveMonths(today = new Date()): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) out.push(monthKey(new Date(today.getFullYear(), today.getMonth() - i, 1)));
  return out;
}

/** Download rows as CSV. Cells starting with = + - @ are prefixed so spreadsheets don't run them. */
export function downloadCsv(rows: (string | number | null | undefined)[][], filename: string): void {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = '\'' + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = rows.map(r => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export const STATE_CODES: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO', CONNECTICUT: 'CT',
  DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC', FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL',
  INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
  MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT',
  NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
  VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY',
  'PUERTO RICO': 'PR', GUAM: 'GU'
};
