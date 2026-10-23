/* Inline SVG charts from the dashboard design. They return SVG markup; every label and number
   passes through esc() first, so data can never inject markup. Colours are CSS variables the
   dashboard defines, and exports swap them for fixed values (EXPORT_TOKENS). */

export interface Series { k: string; c: string; values: number[]; }

const nf = (n: number) => n.toLocaleString('en-US');
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!));
const signed = (d: number | null) => d == null ? '–' : (d > 0 ? '+' : '') + d;

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return ([1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find(x => x >= n) || 10) * p;
}

/** Stacked bars, one per label, with optional totals on top and change-vs-prior under each label. */
export function stackChart(labels: string[], series: Series[], opts: { totals?: boolean; deltas?: (number | null)[] | null; h?: number; w?: number } = {}): string {
  const { totals = true, deltas = null, h = 260, w = 960 } = opts;
  const W = w, H = h, L = 40, R = 10, TP = 22, B = deltas ? 50 : 30;
  const cw = (W - L - R) / Math.max(1, labels.length), bw = Math.min(56, cw * .6);
  const tot = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const max = niceMax(Math.max(1, ...tot)), sc = (H - TP - B) / max;
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = max * k / 4, y = H - B - v * sc;
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" style="stroke:var(${k ? '--line-soft' : '--line'})" ${k ? 'stroke-dasharray="3 4"' : ''}/>`
      + `<text x="${L - 8}" y="${y + 4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${nf(v)}</text>`;
  }
  labels.forEach((lb, i) => {
    const x = L + i * cw + (cw - bw) / 2;
    let y = H - B;
    series.forEach(s => {
      const v = s.values[i];
      if (!v) return;
      const hh = v * sc;
      y -= hh;
      g += `<rect x="${x}" y="${y}" width="${bw}" height="${hh}" style="fill:var(${s.c})"><title>${esc(lb)} · ${esc(s.k)}: ${nf(v)}</title></rect>`;
    });
    if (totals && tot[i]) g += `<text x="${x + bw / 2}" y="${y - 7}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--fg)">${nf(tot[i])}</text>`;
    g += `<text x="${x + bw / 2}" y="${H - B + 18}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--fg)">${esc(lb)}</text>`;
    if (deltas) {
      const d = deltas[i];
      g += `<text x="${x + bw / 2}" y="${H - B + 36}" text-anchor="middle" font-size="11" font-weight="600" style="fill:var(${d == null || d === 0 ? '--faint' : d > 0 ? '--brand' : '--good'})">${signed(d)}</text>`;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/** A percentage line with a soft area under it; the last point is drawn larger. */
export function lineChart(labels: string[], vals: (number | null)[], opts: { min?: number; max?: number; h?: number; suffix?: string } = {}): string {
  const { min = 90, max = 100, h = 230, suffix = '%' } = opts;
  const W = 720, H = h, L = 44, R = 16, TP = 24, B = 30, span = (max - min) || 1;
  const cw = (W - L - R) / Math.max(1, labels.length - 1);
  const xOf = (i: number) => labels.length === 1 ? (W + L - R) / 2 : L + i * cw;
  const pts = vals.map((v, i) => v == null ? null : [xOf(i), TP + (max - v) / span * (H - TP - B)] as [number, number]);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = min + span * k / 4, y = TP + (max - v) / span * (H - TP - B);
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" style="stroke:var(--line-soft)" stroke-dasharray="3 4"/>`
      + `<text x="${L - 8}" y="${y + 4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${v.toFixed(0)}${suffix}</text>`;
  }
  const ok = pts.filter((p): p is [number, number] => !!p);
  if (ok.length > 1) {
    const path = ok.map(p => p.join(',')).join('L');
    g += `<path d="M${path}L${ok[ok.length - 1][0]},${H - B}L${ok[0][0]},${H - B}Z" style="fill:var(--met);opacity:.12"/>`;
    g += `<path d="M${path}" fill="none" style="stroke:var(--met)" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  pts.forEach((p, i) => {
    if (!p) return;
    g += `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 5 : 3.5}" style="fill:var(--surface);stroke:var(--met)" stroke-width="2.5"/>`
      + `<text x="${p[0]}" y="${p[1] - 11}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--fg)">${vals[i]!.toFixed(1)}${suffix}</text>`;
  });
  labels.forEach((lb, i) => {
    g += `<text x="${xOf(i)}" y="${H - 8}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--fg)">${esc(lb)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/** Light palette for exported files (the page itself uses the CSS variables). */
export const EXPORT_TOKENS: Record<string, string> = {
  '--fg': '#1d1617', '--muted': '#6f6566', '--faint': '#a39a9b', '--line': '#e6e1e1', '--line-soft': '#efebeb',
  '--surface': '#ffffff', '--brand': '#c4122f', '--good': '#12a35a', '--met': '#12a35a', '--breach': '#c4122f',
  '--p1': '#c4122f', '--p2': '#d9860b', '--p3': '#7b52ab', '--p4': '#0b6aa6',
  '--c-dispatch': '#0b6aa6', '--c-sched': '#0f9488', '--c-backfill': '#d9860b'
};
export const tok = (v: string) => EXPORT_TOKENS[v] || '#888888';

/** Renders chart markup to a JPEG data URL (for PDF and PowerPoint). */
export function svgToPng(svg: string): Promise<{ url: string; w: number; h: number } | null> {
  return new Promise(resolve => {
    try {
      const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
      if (!vb) return resolve(null);
      const w = +vb[1], h = +vb[2];
      const out = svg.replace(/var\((--[\w-]+)\)/g, (_, v) => tok(v))
        .replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="Helvetica, Arial, sans-serif"`)
        .replace(/<title>[\s\S]*?<\/title>/g, '');
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = Math.round(w * 1.5);
          c.height = Math.round(h * 1.5);
          const x = c.getContext('2d')!;
          x.fillStyle = '#fff';
          x.fillRect(0, 0, c.width, c.height);
          x.drawImage(img, 0, 0, c.width, c.height);
          resolve({ url: c.toDataURL('image/jpeg', 0.85), w, h });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out);
    } catch {
      resolve(null);
    }
  });
}
