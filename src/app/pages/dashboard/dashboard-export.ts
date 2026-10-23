/* Export (PDF / PowerPoint / CSV) from the dashboard design. Each report is built as plain data
   (title, KPI cards, one chart, tables, a note) and then written to the chosen format. The PDF
   and PowerPoint libraries load only when someone exports. */
import { svgToPng, tok } from './charts';

export interface ExportTable { head: string[]; body: string[][]; foot?: string[]; long?: boolean; }
export interface ExportReport {
  title: string;
  kpis: [string, string, string][];
  chart: string | null;
  legend: [string, string][];
  tables: ExportTable[];
  note: string;
}

export const EXPORT_GROUPS: [string, [string, string][]][] = [
  ['Project health', [['health', 'Project health']]],
  ['SLA Dashboard', [['sla-ov', 'SLA overview'], ['sla-mom', 'Month on month SLA'], ['sla-prio', 'SLA by priority'], ['sla-mix', 'Priority mix']]],
  ['Trend analysis', [['tr-types', 'Dispatch, scheduled visits & backfill'], ['tr-sum', 'Month on month summary'], ['tr-state', 'Month on month by state'], ['tr-city', 'Month on month by city']]],
  ['Lists', [['he', 'High effort areas'], ['tickets', 'Tickets']]]
];
export const EXPORT_IDS = EXPORT_GROUPS.flatMap(g => g[1].map(r => r[0]));

export function saveBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export async function makePDF(input: ExportReport[], who: string, filters: string, exportedOn: string): Promise<Blob> {
  // The PDF base fonts lack "≤", so it is spelled out.
  const fix = (s: string) => s.replace(/≤/g, '<=');
  const reps = input.map(r => ({
    ...r,
    title: fix(r.title),
    kpis: r.kpis.map(k => k.map(fix) as [string, string, string]),
    tables: r.tables.map(t => ({ ...t, head: t.head.map(fix), body: t.body.map(b => b.map(fix)), foot: t.foot?.map(fix) })),
    note: fix(r.note)
  }));
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const W = 297, M = 14;
  const head = (t: string, sub: string) => {
    doc.setFillColor(196, 18, 47); doc.rect(0, 0, W, 3, 'F');
    doc.setTextColor(29, 22, 23); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(t, M, 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(111, 101, 102); doc.text(sub, M, 23);
  };
  head(`${who} · Service report`, `Vantage customer portal · ${filters} · exported ${exportedOn}`);
  doc.setFontSize(11); doc.setTextColor(29, 22, 23); doc.text('Contents', M, 36);
  doc.setFontSize(10); doc.setTextColor(80, 70, 72);
  reps.forEach((r, i) => doc.text(`${i + 1}.  ${r.title}`, M + 2, 44 + i * 6.5));
  for (const r of reps) {
    doc.addPage();
    head(r.title, filters);
    let y = 30;
    if (r.kpis.length) {
      const cw = (W - 2 * M - (r.kpis.length - 1) * 4) / r.kpis.length;
      r.kpis.forEach((k, i) => {
        const x = M + i * (cw + 4);
        doc.setFillColor(247, 245, 245); doc.roundedRect(x, y, cw, 20, 2, 2, 'F');
        doc.setFontSize(8); doc.setTextColor(111, 101, 102); doc.text(k[0], x + 4, y + 6);
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(29, 22, 23); doc.text(k[1], x + 4, y + 13);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(111, 101, 102);
        doc.text(doc.splitTextToSize(k[2], cw - 8)[0] || '', x + 4, y + 17.5);
      });
      y += 26;
    }
    if (r.chart) {
      const png = await svgToPng(r.chart);
      if (png) {
        const iw = Math.min(W - 2 * M, 200), ih = iw * png.h / png.w;
        doc.addImage(png.url, 'JPEG', M, y, iw, ih);
        y += ih + 2;
        if (r.legend.length) {
          let x = M;
          doc.setFontSize(8);
          r.legend.forEach(([n, c]) => {
            doc.setFillColor(...rgb(tok(c))); doc.rect(x, y, 3, 3, 'F');
            doc.setTextColor(29, 22, 23); doc.text(n, x + 4.5, y + 2.6);
            x += doc.getTextWidth(n) + 12;
          });
          y += 7;
        }
      }
    }
    for (const t of r.tables) {
      autoTable(doc, {
        startY: y, head: [t.head], body: t.body, foot: t.foot ? [t.foot] : undefined, margin: { left: M, right: M, top: 30 }, theme: 'plain',
        styles: { fontSize: t.head.length > 12 ? 6.5 : 8, cellPadding: 1.8, textColor: [29, 22, 23], lineColor: [230, 225, 225], lineWidth: { bottom: .2 } as any },
        headStyles: { fillColor: [247, 245, 245], textColor: [111, 101, 102], fontStyle: 'bold' },
        footStyles: { fillColor: [247, 245, 245], fontStyle: 'bold' },
        didDrawPage: () => {
          doc.setFontSize(7.5); doc.setTextColor(163, 154, 155);
          doc.text(`${who} · ${r.title}`, M, 205);
          doc.text(`Page ${doc.getNumberOfPages()}`, W - M, 205, { align: 'right' });
        }
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }
    if (r.note) { doc.setFontSize(8); doc.setTextColor(111, 101, 102); doc.text(r.note, M, Math.min(y + 2, 200)); }
  }
  return doc.output('blob');
}

export async function makePPT(reps: ExportReport[], who: string, filters: string): Promise<Blob> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Vantage';
  pptx.title = `${who} service report`;
  const F0 = 'Arial';
  const hex = (c: string) => c.replace('#', '').toUpperCase();
  const title = (s: any, t: string, sub: string) => {
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: .08, fill: { color: 'C4122F' }, line: { color: 'C4122F' } });
    s.addText(t, { x: .5, y: .3, w: 12.3, h: .6, fontFace: F0, fontSize: 24, bold: true, color: '1D1617' });
    s.addText(sub, { x: .5, y: .85, w: 12.3, h: .35, fontFace: F0, fontSize: 11, color: '6F6566' });
  };
  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: .25, h: 7.5, fill: { color: 'C4122F' }, line: { color: 'C4122F' } });
  cover.addText(who, { x: .9, y: 2.2, w: 11, h: .6, fontFace: F0, fontSize: 18, color: 'C4122F', bold: true });
  cover.addText('Service report', { x: .9, y: 2.8, w: 11, h: 1, fontFace: F0, fontSize: 40, bold: true, color: '1D1617' });
  cover.addText(filters, { x: .9, y: 3.9, w: 11, h: .5, fontFace: F0, fontSize: 14, color: '6F6566' });
  cover.addText(reps.map(r => r.title).join('  ·  '), { x: .9, y: 4.6, w: 11.5, h: 1.2, fontFace: F0, fontSize: 11, color: '6F6566', valign: 'top' });
  for (const r of reps) {
    const s = pptx.addSlide();
    title(s, r.title, filters);
    let y = 1.4;
    if (r.kpis.length) {
      const cw = (12.33 - (r.kpis.length - 1) * .2) / r.kpis.length;
      r.kpis.forEach((k, i) => {
        const x = .5 + i * (cw + .2);
        s.addShape(pptx.ShapeType.roundRect, { x, y, w: cw, h: 1.05, fill: { color: 'F7F5F5' }, line: { color: 'F7F5F5' }, rectRadius: .08 });
        s.addText([
          { text: k[0] + '\n', options: { fontSize: 10, color: '6F6566' } },
          { text: k[1] + '\n', options: { fontSize: 22, bold: true, color: '1D1617' } },
          { text: k[2], options: { fontSize: 9, color: '6F6566' } }
        ], { x: x + .15, y, w: cw - .3, h: 1.05, fontFace: F0, valign: 'middle' });
      });
      y += 1.25;
    }
    const png = r.chart ? await svgToPng(r.chart) : null;
    if (png) {
      const ih = Math.min(7.0 - y - (r.legend.length ? .35 : 0), 4.6), iw = Math.min(12.33, ih * png.w / png.h);
      s.addImage({ data: png.url, x: .5, y, w: iw, h: iw * png.h / png.w });
      y += iw * png.h / png.w + .05;
      if (r.legend.length) {
        s.addText(r.legend.flatMap(([n, c]) => [
          { text: '■ ', options: { color: hex(tok(c)), fontSize: 12 } },
          { text: n + '      ', options: { color: '1D1617', fontSize: 10 } }
        ]), { x: .5, y, w: 12.3, h: .3, fontFace: F0 });
      }
    }
    for (const t of r.tables) {
      // Slides hold ~14 rows; very long lists are trimmed with a pointer to CSV/PDF.
      const cap = t.long ? 28 : r.title.endsWith('by city') ? 42 : 999, body = t.body.slice(0, cap), per = 14;
      const fs = t.head.length > 12 ? 7 : t.head.length > 8 ? 8 : 10;
      const hdr = t.head.map(h => ({ text: h, options: { bold: true, color: '6F6566', fill: { color: 'F7F5F5' } } }));
      const chunks: string[][][] = [];
      for (let i = 0; i < body.length; i += per) chunks.push(body.slice(i, i + per));
      if (!chunks.length) chunks.push([]);
      chunks.forEach((ch, ci) => {
        const last = ci === chunks.length - 1;
        const rows: any[] = [hdr, ...ch.map(row => row.map(c => ({ text: c }))),
          ...(last && t.foot ? [t.foot.map(c => ({ text: c, options: { bold: true, fill: { color: 'F7F5F5' } } }))] : [])];
        const same = ci === 0 && !png && y < 3.2 && ch.length <= 10 && t === r.tables[0];
        const ts = same ? s : pptx.addSlide();
        if (!same) title(ts, r.title + (chunks.length > 1 ? ` · table ${ci + 1} of ${chunks.length}` : ' · table'), filters);
        ts.addTable(rows, { x: .5, y: same ? y : 1.4, w: 12.33, fontFace: F0, fontSize: fs, color: '1D1617', border: { type: 'solid', pt: .5, color: 'E6E1E1' }, rowH: .34, margin: .05 });
        if (last && t.body.length > cap) {
          ts.addText(`Showing the first ${cap} of ${t.body.length.toLocaleString('en-US')} rows. Export CSV or PDF for the full list.`,
            { x: .5, y: 7.0, w: 12.3, h: .3, fontSize: 9, color: '6F6566', fontFace: F0 });
        }
      });
    }
    if (r.note) s.addText(r.note, { x: .5, y: 7.05, w: 12.3, h: .3, fontSize: 9, color: '6F6566', fontFace: F0 });
  }
  return await pptx.write({ outputType: 'blob' }) as Blob;
}

export function makeCSV(reps: ExportReport[], who: string, filters: string): Blob {
  const q = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = '\'' + s; // keep spreadsheets from running cells as formulas
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const L: string[] = [q(`${who} · Service report`), q('Filters: ' + filters), ''];
  reps.forEach(r => {
    L.push(q(r.title));
    r.kpis.forEach(k => L.push(k.map(q).join(',')));
    r.tables.forEach(t => {
      L.push('', t.head.map(q).join(','));
      t.body.forEach(b => L.push(b.map(q).join(',')));
      if (t.foot) L.push(t.foot.map(q).join(','));
    });
    if (r.note) L.push(q(r.note));
    L.push('', '');
  });
  return new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}
