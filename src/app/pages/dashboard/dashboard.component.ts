import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NgFor, NgIf, NgStyle, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService } from '../../core/data.service';
import { lastTwelveMonths, monthLabel, monthShort } from '../../core/format';
import { Priority, RemoteArea, StageKey, Ticket } from '../../core/models';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';
import { Series, lineChart, stackChart } from './charts';
import { EXPORT_GROUPS, EXPORT_IDS, ExportReport, makeCSV, makePDF, makePPT, saveBlob } from './dashboard-export';

/** The design's four ticket states, from the seven work order stages. */
type Status = 'Raised' | 'Ongoing' | 'Completed' | 'Cancelled';
const STATUSES: Status[] = ['Raised', 'Ongoing', 'Completed', 'Cancelled'];
const STATUS_OF: Record<StageKey, Status> = {
  created: 'Raised', accepted: 'Raised', scheduled: 'Raised', ongoing: 'Ongoing',
  completed: 'Completed', cancelled: 'Cancelled', rejected: 'Cancelled'
};
const STATUS_NOTE: Record<Status, string> = {
  Raised: 'Logged and waiting to be scheduled or started',
  Ongoing: 'An engineer is working on these',
  Completed: 'Visit done and closed',
  Cancelled: 'Withdrawn or rejected before a visit took place'
};

const PRIO = [
  { k: 'P1' as Priority, n: 'Critical', r: 'response ≤ 4 h', c: '--p1' },
  { k: 'P2' as Priority, n: 'High', r: 'response ≤ 8 h', c: '--p2' },
  { k: 'P3' as Priority, n: 'Medium', r: 'response ≤ 1 day', c: '--p3' },
  { k: 'P4' as Priority, n: 'Routine', r: 'over 1 day', c: '--p4' }
];
const TYPES = [
  { k: 'Dispatch', c: '--c-dispatch' },
  { k: 'Scheduled visit', c: '--c-sched' },
  { k: 'Backfill', c: '--c-backfill' }
];
const typeOf = (t: Ticket) => /backfill/i.test(t.visitType) ? 2 : /sched/i.test(t.visitType) ? 1 : 0;
const prioOf = (t: Ticket) => Math.max(0, PRIO.findIndex(p => p.k === t.pr));

const SECTIONS = [
  { k: 'health', label: 'Project health', desc: 'Raised, ongoing, completed and cancelled tiles' },
  { k: 'sla', label: 'SLA Dashboard', desc: 'Overview, month on month, by priority, priority mix' },
  { k: 'trend', label: 'Trend analysis', desc: 'Visit types, monthly summary, by state and city' },
  { k: 'he', label: 'High effort areas', desc: 'Very remote dispatch locations' },
  { k: 'tickets', label: 'Tickets', desc: 'Work orders by status' }
] as const;
type SectionKey = typeof SECTIONS[number]['k'];

interface Filters { period: string; region: string; state: string; city: string; prio: number[]; status: Status | ''; q: string; }
interface Card { k: string; v: string; s: string; cls?: string; dot?: string; }
interface Heat { v: number; style: Record<string, string> | null; }
interface SavedReport { name: string; f: Filters; }

const nf = (n: number) => n.toLocaleString('en-US');
const pct = (a: number, b: number, d = 1) => b ? (a / b * 100).toFixed(d) + '%' : '–';
const hrs = (h: number | null) => h == null ? '–' : Math.floor(h) + 'h ' + String(Math.round(h % 1 * 60)).padStart(2, '0') + 'm';
const avg = (a: Ticket[]) => {
  const v = a.filter(t => t.hours != null);
  return v.length ? v.reduce((x, t) => x + (t.hours || 0), 0) / v.length : null;
};
const signed = (d: number | null, suffix = '') => d == null ? '–' : (d > 0 ? '+' : '') + d + suffix;
const brOf = (a: Ticket[]) => a.filter(t => !t.slaMet).length;
const slaP = (a: Ticket[]) => a.length ? (a.length - brOf(a)) / a.length * 100 : null;
const f1 = (v: number | null) => v == null ? '–' : v.toFixed(1) + '%';
const heat = (v: number, max: number): Heat => ({ v, style: v ? { '--a': Math.round(6 + Math.min(1, v / max) * 30) + '%' } : null });

/**
 * Customer dashboard — the "Vantage Customer Dashboard" design: toolbar, filters, Project health,
 * SLA Dashboard and Trend analysis (tabbed), High effort areas and Tickets. Built from the
 * signed-in user's own work orders (customerDashboard/get, scoped on the server).
 */
@Component({
  selector: 'cp-dashboard',
  standalone: true,
  imports: [NgIf, NgFor, NgStyle, NgTemplateOutlet, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly PRIO = PRIO;
  readonly TYPES = TYPES;
  readonly STATUSES = STATUSES;
  readonly SECTIONS = SECTIONS;
  readonly EXPORT_GROUPS = EXPORT_GROUPS;
  readonly nf = nf;
  readonly pct = pct;
  readonly hrs = hrs;
  readonly f1 = f1;
  readonly signed = signed;
  readonly prioOf = prioOf;
  readonly typeOf = typeOf;

  loading = true;
  error = '';
  customerName = '';
  private all: Ticket[] = [];
  private remote: RemoteArea[] = [];
  readonly months = lastTwelveMonths();
  regions: string[] = [];
  states: { code: string; name: string }[] = [];

  F: Filters = this.blankFilters();
  rows: Ticket[] = [];
  base: Ticket[] = [];
  tiles: { s: Status; n: number; p: string; cls: string }[] = [];

  sTab: 'ov' | 'mom' | 'prio' | 'mix' = 'ov';
  dTab: 'types' | 'sum' | 'state' | 'city' = 'types';
  topN = 15;
  sla: any = null;
  trend: any = null;
  he: { rank: number; city: string; state: string; pin: string; nearest: string; n: Heat }[] = [];
  heTotal = 0;

  tkTab: Status = 'Raised';
  tkShow = 10;
  tkCounts: Record<Status, number> = { Raised: 0, Ongoing: 0, Completed: 0, Cancelled: 0 };
  tkAll: Ticket[] = [];

  show: Record<SectionKey, boolean> = { health: true, sla: true, trend: true, he: true, tickets: true };
  customizeOpen = false;
  saveOpen = false;
  saveName = '';
  saved: SavedReport[] = [];

  expOpen = false;
  expSel = new Set<string>(EXPORT_IDS);
  expDet: 'summary' | 'full' = 'summary';
  expFmt: 'pdf' | 'pptx' | 'csv' = 'pdf';
  exporting = false;

  private sub?: Subscription;
  private readonly prefKey: string;

  constructor(
    private data: DataService,
    private toast: ToastService,
    private router: Router,
    private sanitizer: DomSanitizer,
    session: SessionService
  ) {
    this.prefKey = 'cp_dash2_' + (session.session?.userId || '');
    this.loadPrefs();
  }

  ngOnInit(): void {
    this.sub = this.data.watch().subscribe({
      next: d => {
        this.loading = false;
        this.error = '';
        this.customerName = d.customerName;
        this.all = d.tickets.filter(t => this.months.includes(t.monthKey));
        this.remote = d.remoteAreas;
        this.regions = Array.from(new Set(this.all.map(t => t.region))).sort();
        const st = new Map<string, string>();
        this.all.forEach(t => st.set(t.state, t.stateCode));
        this.states = Array.from(st, ([name, code]) => ({ name, code })).sort((a, b) => a.name.localeCompare(b.name));
        this.render();
      },
      error: err => { this.loading = false; this.error = err?.message || 'Could not load work orders.'; }
    });
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  @HostListener('document:keydown.escape') onEscape(): void {
    this.expOpen = this.customizeOpen = this.saveOpen = false;
  }
  @HostListener('document:click', ['$event']) onDocClick(ev: MouseEvent): void {
    if (this.expOpen && !(ev.target as HTMLElement).closest('.exp')) this.expOpen = false;
  }

  // ---- Preferences (this browser) --------------------------------------------------------------
  private loadPrefs(): void {
    try {
      const p = JSON.parse(localStorage.getItem(this.prefKey) || '{}');
      if (p.show) this.show = { ...this.show, ...p.show };
      if (Array.isArray(p.saved)) this.saved = p.saved;
    } catch { /* private window */ }
  }
  private savePrefs(): void {
    try { localStorage.setItem(this.prefKey, JSON.stringify({ show: this.show, saved: this.saved })); } catch { /* ignore */ }
  }
  toggleSection(k: SectionKey): void { this.show[k] = !this.show[k]; this.savePrefs(); }

  // ---- Filters ---------------------------------------------------------------------------------
  private blankFilters(): Filters { return { period: 'all', region: '', state: '', city: '', prio: [], status: '', q: '' }; }
  get periodOptions(): { v: string; l: string }[] {
    const first = monthLabel(this.months[0]), last = monthLabel(this.months[this.months.length - 1]);
    return [
      { v: 'all', l: `All 12 months (${first} – ${last})` },
      { v: 'l6', l: 'Last 6 months' },
      { v: 'l3', l: 'Last 3 months' }
    ];
  }
  readonly monthLabel = monthLabel;
  monthsIn(): string[] {
    if (this.F.period === 'all') return this.months;
    if (this.F.period === 'l6') return this.months.slice(-6);
    if (this.F.period === 'l3') return this.months.slice(-3);
    return [this.F.period];
  }
  private match(t: Ticket, skip?: 'prio' | 'status'): boolean {
    const F = this.F;
    if (!this.monthsIn().includes(t.monthKey)) return false;
    if (F.region && t.region !== F.region) return false;
    if (F.state && t.state !== F.state) return false;
    if (F.city && !t.city.toLowerCase().includes(F.city.toLowerCase())) return false;
    if (skip !== 'prio' && F.prio.length && !F.prio.includes(prioOf(t))) return false;
    if (skip !== 'status' && F.status && STATUS_OF[t.stage] !== F.status) return false;
    if (F.q) {
      const q = F.q.toLowerCase();
      if (![t.id, t.clientTicket, t.city, t.state, t.stateCode, t.service].some(v => (v || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }
  togglePrio(i: number): void {
    this.F.prio = this.F.prio.includes(i) ? this.F.prio.filter(x => x !== i) : [...this.F.prio, i];
    this.render();
  }
  /** Clicking a priority in a chart isolates it; clicking it again clears. */
  onlyPrio(i: number): void {
    this.F.prio = this.F.prio.length === 1 && this.F.prio[0] === i ? [] : [i];
    this.render();
  }
  toggleStatus(s: Status): void {
    this.F.status = this.F.status === s ? '' : s;
    if (this.F.status) { this.tkTab = this.F.status; this.tkShow = 10; }
    this.render();
  }
  reset(): void { this.F = this.blankFilters(); this.render(); }
  pickPlace(k: string): void {
    if (this.dTab === 'city') { const [c, st] = k.split('|'); this.F.city = c; this.F.state = st; }
    else this.F.state = k;
    this.render();
  }

  // ---- Saved reports and schedule ------------------------------------------------------------
  saveReport(): void {
    const name = this.saveName.trim();
    if (!name) return this.toast.error('Give the report a name');
    this.saved = [...this.saved.filter(s => s.name !== name), { name, f: JSON.parse(JSON.stringify(this.F)) }];
    this.savePrefs();
    this.saveOpen = false;
    this.saveName = '';
    this.toast.show(`Saved "${name}"`);
  }
  applySaved(s: SavedReport): void { this.F = { ...this.blankFilters(), ...JSON.parse(JSON.stringify(s.f)) }; this.render(); }
  removeSaved(s: SavedReport, ev: Event): void {
    ev.stopPropagation();
    this.saved = this.saved.filter(x => x !== s);
    this.savePrefs();
  }
  schedule(): void { this.toast.show('Scheduled email reports are not available yet. Use Export for now.'); }

  // ---- Render ----------------------------------------------------------------------------------
  private svg(markup: string): SafeHtml { return this.sanitizer.bypassSecurityTrustHtml(markup); }
  private perMonth(data: Ticket[]) { return this.monthsIn().map(m => { const r = data.filter(t => t.monthKey === m); return { m, r, n: r.length }; }); }
  private labels(): string[] { return this.monthsIn().map(monthShort); }

  render(): void {
    this.rows = this.all.filter(t => this.match(t));
    this.base = this.all.filter(t => this.match(t, 'status'));
    this.tiles = STATUSES.map(s => {
      const n = this.base.filter(t => STATUS_OF[t.stage] === s).length;
      return { s, n, p: pct(n, this.base.length), cls: { Raised: 'raised', Ongoing: 'ongoing', Completed: 'done', Cancelled: 'cancel' }[s] };
    });
    this.renderSLA();
    this.renderTrend();
    this.renderHE();
    this.renderTickets();
  }

  setSTab(t: any): void { this.sTab = t; this.renderSLA(); }
  setDTab(t: any): void { this.dTab = t; this.renderTrend(); }
  setTopN(n: number): void { this.topN = +n; this.renderTrend(); }

  private renderSLA(): void {
    const data = this.rows, per = this.perMonth(data), labels = this.labels();
    if (!data.length) { this.sla = null; return; }
    const br = brOf(data), met = data.length - br;
    const monthP = per.map(x => slaP(x.r));
    const lo = Math.max(0, Math.floor(Math.min(...monthP.filter((v): v is number => v != null), 100) / 2) * 2 - 2);
    const v: any = { tab: this.sTab };
    if (this.sTab === 'ov') {
      const byP = PRIO.map((_, i) => data.filter(t => prioOf(t) === i));
      const withData = per.filter(x => x.n);
      const best = withData.reduce((a, b) => (slaP(b.r)! > slaP(a.r)! ? b : a), withData[0]);
      const worst = withData.reduce((a, b) => (slaP(b.r)! < slaP(a.r)! ? b : a), withData[0]);
      const p4 = data.filter(t => !t.slaMet && t.pr === 'P4').length;
      v.cards = [
        { k: 'Within SLA', v: pct(met, data.length), s: `${nf(met)} of ${nf(data.length)} tickets`, cls: 'good' },
        { k: 'SLA breached', v: nf(br), s: `${pct(br, data.length)} breach rate`, cls: br ? 'bad' : '' },
        { k: 'P1 Critical', v: f1(slaP(byP[0])), s: `${byP[0].length} tickets · response ≤ 4 h` },
        { k: 'P2 High', v: f1(slaP(byP[1])), s: `${byP[1].length} tickets · response ≤ 8 h` }
      ] as Card[];
      v.insights = [
        { warn: false, b: `${pct(met, data.length)} of tickets met SLA`, t: ` across ${per.length} month${per.length > 1 ? 's' : ''}.` },
        br
          ? { warn: true, b: `${p4 === br ? (br === 1 ? 'The only breach' : `All ${br} breaches`) : `${p4} of ${br} breaches`}`,
              t: ` ${br === 1 && p4 === br ? 'was a P4 routine ticket' : 'were P4 routine tickets'}. Critical and high priority tickets ${byP.slice(0, 3).every(a => !brOf(a)) ? 'were all answered on time' : 'had some breaches'}.` }
          : { warn: false, b: 'No breaches', t: ' in this selection.' }
      ];
      if (withData.length > 1) {
        v.insights.push({ warn: false, b: '', t: '', best: `${monthLabel(best.m)} at ${f1(slaP(best.r))}`, worst: `${monthLabel(worst.m)} at ${f1(slaP(worst.r))}` });
      }
      v.line = this.svg(lineChart(labels, monthP, { min: lo }));
      v.bars = PRIO.map((p, i) => { const s = slaP(byP[i]); return { i, p, count: byP[i].length, value: s, width: s ?? 0, color: s === 100 ? '--met' : '--p4' }; });
    }
    if (this.sTab === 'mom') {
      v.stack = this.svg(stackChart(labels, [
        { k: 'SLA met', c: '--met', values: per.map(x => x.n - brOf(x.r)) },
        { k: 'SLA breached', c: '--breach', values: per.map(x => brOf(x.r)) }
      ], { w: 720 }));
      v.legend = [['SLA met', '--met'], ['SLA breached', '--breach']];
      v.line = this.svg(lineChart(labels, monthP, { min: lo }));
      let prev: number | null = null;
      v.rows = per.map(x => {
        const b = brOf(x.r), p = slaP(x.r), d = prev == null || p == null ? null : p - prev;
        prev = p;
        return { label: monthLabel(x.m), n: x.n, met: x.n - b, b, p: pct(x.n - b, x.n), d, rate: pct(b, x.n) };
      });
      v.total = { n: data.length, met, b: br, p: pct(met, data.length), rate: pct(br, data.length) };
    }
    if (this.sTab === 'prio') {
      v.cards = PRIO.map((p, i) => {
        const a = data.filter(t => prioOf(t) === i), b = brOf(a);
        return { k: `${p.k} · ${p.n}`, v: a.length ? pct(a.length - b, a.length) : '–', s: `${nf(a.length)} tickets · ${b} breached · ${p.r}`, cls: a.length && !b ? 'good' : '', dot: p.c };
      });
      const cell = (a: Ticket[]) => { const n = a.length, b = brOf(a); return { n, b, p: n ? pct(n - b, n) : '–' }; };
      v.rows = per.map(x => ({ label: monthLabel(x.m), cells: [...PRIO.map((_, i) => cell(x.r.filter(t => prioOf(t) === i))), cell(x.r)] }));
      v.total = [...PRIO.map((_, i) => cell(data.filter(t => prioOf(t) === i))), cell(data)];
    }
    if (this.sTab === 'mix') {
      const tot = data.length;
      v.mix = PRIO.map((p, i) => {
        const n = data.filter(t => prioOf(t) === i).length;
        return { i, p, n, pc: pct(n, tot), width: tot ? n / tot * 100 : 0, dim: this.F.prio.length > 0 && !this.F.prio.includes(i) };
      });
      v.stack = this.svg(stackChart(labels, PRIO.map((p, i) => ({ k: p.k, c: p.c, values: per.map(x => x.r.filter(t => prioOf(t) === i).length) })), { h: 300, w: 620 }));
      v.legend = PRIO.map(p => [p.k, p.c]);
      const rows = PRIO.map((p, i) => ({ p, m: per.map(x => x.r.filter(t => prioOf(t) === i).length), n: data.filter(t => prioOf(t) === i).length }))
        .sort((a, b) => b.n - a.n);
      const mx = Math.max(1, ...rows.flatMap(r => r.m));
      v.rows = rows.map(r => ({ p: r.p, cells: r.m.map(x => heat(x, mx)), n: r.n, pc: pct(r.n, tot) }));
      v.months = per.map(x => ({ label: monthLabel(x.m), n: x.n }));
      v.total = tot;
    }
    this.sla = v;
  }

  private renderTrend(): void {
    const data = this.rows, per = this.perMonth(data), ms = this.monthsIn(), labels = this.labels();
    if (!data.length) { this.trend = null; return; }
    const v: any = { tab: this.dTab };
    if (this.dTab === 'types') {
      const cnt = TYPES.map((_, i) => data.filter(t => typeOf(t) === i));
      v.summary = `${nf(data.length)} visits · average visit ${hrs(avg(data))}`;
      v.cards = TYPES.map((t, i) => ({ k: t.k, v: nf(cnt[i].length), s: `${pct(cnt[i].length, data.length)} of visits · avg ${hrs(avg(cnt[i]))}`, dot: t.c }));
      v.stack = this.svg(stackChart(labels, TYPES.map((t, i) => ({ k: t.k, c: t.c, values: per.map(x => x.r.filter(r => typeOf(r) === i).length) }))));
      v.legend = TYPES.map(t => [t.k, t.c]);
      v.rows = per.map(x => ({
        label: monthLabel(x.m), types: TYPES.map((_, i) => x.r.filter(r => typeOf(r) === i).length), n: x.n,
        avg: hrs(avg(x.r)), full: x.r.filter(r => r.ticketType === 'FULL_DAY').length
      }));
      v.total = { types: cnt.map(c => c.length), n: data.length, avg: hrs(avg(data)), full: data.filter(r => r.ticketType === 'FULL_DAY').length };
    }
    if (this.dTab === 'sum') {
      const deltas = per.map((x, i) => i ? x.n - per[i - 1].n : null);
      const peak = per.reduce((a, b) => b.n > a.n ? b : a, per[0]), low = per.reduce((a, b) => b.n < a.n ? b : a, per[0]);
      v.cards = [
        { k: 'Total visits', v: nf(data.length), s: `${per.length} month${per.length > 1 ? 's' : ''}` },
        { k: 'Monthly average', v: nf(Math.round(data.length / per.length)), s: 'visits per month' },
        { k: 'Busiest month', v: monthLabel(peak.m), s: `${nf(peak.n)} visits` },
        { k: 'Quietest month', v: monthLabel(low.m), s: `${nf(low.n)} visits` }
      ];
      v.stack = this.svg(stackChart(labels, PRIO.map((p, i) => ({ k: p.k + ' · ' + p.n, c: p.c, values: per.map(x => x.r.filter(r => prioOf(r) === i).length) })), { deltas }));
      v.legend = PRIO.map(p => [p.k + ' · ' + p.n, p.c]);
      const max = Math.max(1, ...per.map(x => x.n));
      v.rows = per.map((x, i) => {
        const d = deltas[i], prev = i ? per[i - 1].n : 0;
        return {
          label: monthLabel(x.m), n: heat(x.n, max), share: pct(x.n, data.length), d,
          dp: d == null || !prev ? '–' : (d > 0 ? '+' : '') + (d / prev * 100).toFixed(1) + '%',
          prio: PRIO.map((_, p) => x.r.filter(r => prioOf(r) === p).length)
        };
      });
      v.total = { n: data.length, prio: PRIO.map((_, p) => data.filter(r => prioOf(r) === p).length) };
    }
    if (this.dTab === 'state' || this.dTab === 'city') {
      const isCity = this.dTab === 'city';
      const map = new Map<string, { k: string; t: Ticket; m: Record<string, number>; n: number; rank: number }>();
      data.forEach(t => {
        const k = isCity ? t.city + '|' + t.state : t.state;
        if (!map.has(k)) map.set(k, { k, t, m: {}, n: 0, rank: 0 });
        const o = map.get(k)!;
        o.m[t.monthKey] = (o.m[t.monthKey] || 0) + 1;
        o.n++;
      });
      const list = Array.from(map.values()).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
      list.forEach((o, i) => (o.rank = i && o.n === list[i - 1].n ? list[i - 1].rank : i + 1));
      const top10 = list.slice(0, 10), mx = top10[0].n;
      v.isCity = isCity;
      v.count = list.length;
      v.share = pct(top10.reduce((a, o) => a + o.n, 0), data.length);
      v.top10 = top10.map(o => ({ k: o.k, name: isCity ? o.t.city : o.t.state, sub: isCity ? o.t.stateCode : o.t.stateCode, n: o.n, width: o.n / mx * 100 }));
      v.perMonth = this.svg(stackChart(labels, [{ k: 'Visits', c: '--brand', values: per.map(x => x.n) }], { h: 300, w: 620 }));
      const top = list.slice(0, this.topN);
      const maxCell = Math.max(1, ...top.flatMap(o => ms.map(m => o.m[m] || 0)));
      let cum = 0;
      v.rows = top.map(o => {
        cum += o.n;
        return {
          k: o.k, rank: o.rank, name: isCity ? o.t.city : o.t.state, sub: isCity ? o.t.stateCode : o.t.stateCode, region: o.t.region,
          cells: ms.map(m => heat(o.m[m] || 0, maxCell)), n: o.n, share: pct(o.n, data.length), cum: pct(cum, data.length)
        };
      });
      v.months = ms.map(monthShort);
    }
    this.trend = v;
  }

  private renderHE(): void {
    const F = this.F;
    const list = this.remote.filter(r =>
      (!F.state || r.state.toLowerCase() === F.state.toLowerCase())
      && (!F.region || this.all.some(t => t.state.toLowerCase() === r.state.toLowerCase() && t.region === F.region))
      && (!F.city || r.city.toLowerCase().includes(F.city.toLowerCase())));
    const counts = list.map(r => this.rows.filter(t => t.city.toLowerCase() === r.city.toLowerCase() && t.state.toLowerCase() === r.state.toLowerCase()).length);
    const max = Math.max(1, ...counts);
    this.heTotal = counts.reduce((a, b) => a + b, 0);
    this.he = list.map((r, i) => ({ rank: i + 1, city: r.city, state: r.state, pin: r.pin, nearest: r.nearest, n: heat(counts[i], max) }));
  }

  private renderTickets(): void {
    STATUSES.forEach(s => (this.tkCounts[s] = this.base.filter(t => STATUS_OF[t.stage] === s).length));
    this.tkAll = this.base.filter(t => STATUS_OF[t.stage] === this.tkTab).sort((a, b) => b.created.getTime() - a.created.getTime());
  }
  setTkTab(s: Status): void { this.tkTab = s; this.tkShow = 10; this.renderTickets(); }
  get tkList(): Ticket[] { return this.tkAll.slice(0, this.tkShow); }
  get tkNote(): string { return `${STATUS_NOTE[this.tkTab]} · showing ${this.tkList.length} of ${nf(this.tkAll.length)}, newest first`; }
  fmtDate(d: Date): string { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  openTicket(t: Ticket): void { this.router.navigate(['/work-order', t.dbId]); }

  // ---- Export ----------------------------------------------------------------------------------
  toggleExp(id: string): void { this.expSel.has(id) ? this.expSel.delete(id) : this.expSel.add(id); }
  toggleExpAll(on: boolean): void { this.expSel = new Set(on ? EXPORT_IDS : []); }
  get expAll(): boolean { return this.expSel.size === EXPORT_IDS.length; }
  get expCount(): string {
    const on = this.expSel.size;
    return on === EXPORT_IDS.length ? `All ${on} reports in one file` : on ? `${on} report${on > 1 ? 's' : ''} in one file` : 'Pick at least one report';
  }

  filterSummary(): string {
    const ms = this.monthsIn(), F = this.F;
    const parts = [ms.length === 1 ? monthLabel(ms[0]) : monthLabel(ms[0]) + ' to ' + monthLabel(ms[ms.length - 1])];
    if (F.region) parts.push(F.region + ' region');
    if (F.state) parts.push(F.state);
    if (F.city) parts.push(`City contains "${F.city}"`);
    if (F.prio.length) parts.push(F.prio.slice().sort().map(i => PRIO[i].k).join(', '));
    if (F.status) parts.push(F.status);
    if (F.q) parts.push(`Search "${F.q}"`);
    return parts.join(' · ');
  }

  async runExport(): Promise<void> {
    const ids = EXPORT_IDS.filter(id => this.expSel.has(id));
    if (!ids.length || this.exporting) return;
    this.exporting = true;
    try {
      const compact = this.expDet === 'summary';
      const reps = ids.map(id => this.buildReport(id, compact));
      const who = this.customerName || 'Customer';
      const name = (ids.length === EXPORT_IDS.length ? 'All reports' : ids.length === 1 ? reps[0].title : ids.length + ' reports')
        .replace(/[^\w ]+/g, '').replace(/\s+/g, '_');
      const today = new Date();
      const stamp = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const file = `${who.replace(/[^\w]+/g, '_')}_${name}_${compact ? 'Summary' : 'Full'}_${stamp}.${this.expFmt}`;
      const filters = this.filterSummary();
      const blob = this.expFmt === 'pdf'
        ? await makePDF(reps, who, filters, today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
        : this.expFmt === 'pptx' ? await makePPT(reps, who, filters) : makeCSV(reps, who, filters);
      saveBlob(blob, file);
      this.expOpen = false;
      this.toast.show(`${file} is ready`);
    } catch (e) {
      console.error(e);
      this.toast.error('Export did not work. Try again or pick another format.');
    } finally {
      this.exporting = false;
    }
  }

  /** One report as data, from the current filters (same content as the matching tab). */
  private buildReport(id: string, compact: boolean): ExportReport {
    const data = this.rows, base = this.base, per = this.perMonth(data), labels = this.labels(), ms = this.monthsIn();
    const R: ExportReport = { title: '', kpis: [], chart: null, legend: [], tables: [], note: '' };
    const byPrio = (a: Ticket[], i: number) => a.filter(t => prioOf(t) === i);
    if (id === 'health') {
      R.title = 'Project health';
      const n = (s: Status) => base.filter(t => STATUS_OF[t.stage] === s).length;
      R.kpis = STATUSES.map(s => [s, nf(n(s)), pct(n(s), base.length) + ' of tickets']);
      R.tables.push({ head: ['Status', 'Tickets', '% of tickets'], body: STATUSES.map(s => [s, nf(n(s)), pct(n(s), base.length)]), foot: ['Total', nf(base.length), '100.0%'] });
    }
    if (id === 'sla-ov') {
      R.title = 'SLA overview';
      const br = brOf(data);
      R.kpis = [['Within SLA', pct(data.length - br, data.length), `${nf(data.length - br)} of ${nf(data.length)} tickets`], ['SLA breached', nf(br), pct(br, data.length) + ' breach rate'],
        ...[0, 1].map(i => { const a = byPrio(data, i); return [PRIO[i].k + ' ' + PRIO[i].n, f1(slaP(a)), a.length + ' tickets'] as [string, string, string]; })];
      const mp = per.map(x => slaP(x.r)), lo = Math.max(0, Math.floor(Math.min(...mp.filter((v): v is number => v != null), 100) / 2) * 2 - 2);
      R.chart = lineChart(labels, mp, { min: lo });
      R.tables.push({
        head: ['Priority', 'Response target', 'Tickets', 'Breached', 'SLA %'],
        body: PRIO.map((p, i) => { const a = byPrio(data, i); return [p.k + ' · ' + p.n, p.r, nf(a.length), String(brOf(a)), f1(slaP(a))]; }),
        foot: ['All priorities', '', nf(data.length), String(br), f1(slaP(data))]
      });
    }
    if (id === 'sla-mom') {
      R.title = 'Month on month SLA';
      R.chart = stackChart(labels, [{ k: 'SLA met', c: '--met', values: per.map(x => x.n - brOf(x.r)) }, { k: 'SLA breached', c: '--breach', values: per.map(x => brOf(x.r)) }]);
      R.legend = [['SLA met', '--met'], ['SLA breached', '--breach']];
      let prev: number | null = null;
      R.tables.push({
        head: ['Month', 'Total tickets', 'SLA met', 'SLA breached', 'SLA %', 'Change vs prior (pts)', 'Breach rate'],
        body: per.map(x => { const b = brOf(x.r), p = slaP(x.r), d = prev == null || p == null ? null : p - prev; prev = p;
          return [monthLabel(x.m), nf(x.n), nf(x.n - b), String(b), f1(p), d == null ? '–' : (d > 0 ? '+' : '') + d.toFixed(1), pct(b, x.n)]; }),
        foot: ['Total', nf(data.length), nf(data.length - brOf(data)), String(brOf(data)), f1(slaP(data)), '–', pct(brOf(data), data.length)]
      });
      R.note = 'SLA % = tickets resolved within SLA ÷ total tickets.';
    }
    if (id === 'sla-prio') {
      R.title = 'SLA by priority';
      R.kpis = PRIO.map((p, i) => { const a = byPrio(data, i); return [p.k + ' · ' + p.n, f1(slaP(a)), `${nf(a.length)} tickets · ${brOf(a)} breached`]; });
      const cells = (a: Ticket[]) => [a.length ? nf(a.length) : '–', brOf(a) ? String(brOf(a)) : '–', a.length ? f1(slaP(a)) : '–'];
      R.tables.push({
        head: ['Month', ...PRIO.flatMap(p => [p.k + ' tickets', p.k + ' breached', p.k + ' SLA %']), 'All tickets', 'All breached', 'All SLA %'],
        body: per.map(x => [monthLabel(x.m), ...PRIO.flatMap((_, i) => cells(byPrio(x.r, i))), ...cells(x.r)]),
        foot: ['Total', ...PRIO.flatMap((_, i) => cells(byPrio(data, i))), ...cells(data)]
      });
      R.note = '"–" means no tickets of that priority in the month.';
    }
    if (id === 'sla-mix') {
      R.title = 'Priority mix';
      R.kpis = PRIO.map((p, i) => { const n = byPrio(data, i).length; return [p.k + ' · ' + p.n, nf(n), pct(n, data.length) + ' of tickets']; });
      R.chart = stackChart(labels, PRIO.map((p, i) => ({ k: p.k, c: p.c, values: per.map(x => byPrio(x.r, i).length) })));
      R.legend = PRIO.map(p => [p.k + ' · ' + p.n, p.c]);
      R.tables.push({
        head: ['Priority', ...per.map(x => monthLabel(x.m)), 'Total', '% of total'],
        body: PRIO.map((p, i) => ({ p, i, n: byPrio(data, i).length })).sort((a, b) => b.n - a.n)
          .map(r => [r.p.k + ' · ' + r.p.n, ...per.map(x => { const n = byPrio(x.r, r.i).length; return n ? nf(n) : '–'; }), nf(r.n), pct(r.n, data.length)]),
        foot: ['Total', ...per.map(x => nf(x.n)), nf(data.length), '100.0%']
      });
    }
    if (id === 'tr-types') {
      R.title = 'Dispatch, scheduled visits & backfill';
      const c = TYPES.map((_, i) => data.filter(t => typeOf(t) === i));
      R.kpis = TYPES.map((t, i) => [t.k, nf(c[i].length), `${pct(c[i].length, data.length)} · avg visit ${hrs(avg(c[i]))}`]);
      R.chart = stackChart(labels, TYPES.map((t, i) => ({ k: t.k, c: t.c, values: per.map(x => x.r.filter(r => typeOf(r) === i).length) })));
      R.legend = TYPES.map(t => [t.k, t.c]);
      R.tables.push({
        head: ['Month', ...TYPES.map(t => t.k), 'Total visits', 'Avg visit time'],
        body: per.map(x => [monthLabel(x.m), ...TYPES.map((_, i) => String(x.r.filter(r => typeOf(r) === i).length)), nf(x.n), hrs(avg(x.r))]),
        foot: ['Total', ...c.map(a => nf(a.length)), nf(data.length), hrs(avg(data))]
      });
    }
    if (id === 'tr-sum') {
      R.title = 'Month on month summary';
      const deltas = per.map((x, i) => i ? x.n - per[i - 1].n : null);
      R.kpis = [['Total visits', nf(data.length), per.length + ' months'], ['Monthly average', nf(Math.round(data.length / Math.max(1, per.length))), 'visits per month']];
      R.chart = stackChart(labels, PRIO.map((p, i) => ({ k: p.k, c: p.c, values: per.map(x => byPrio(x.r, i).length) })), { deltas });
      R.legend = PRIO.map(p => [p.k + ' · ' + p.n, p.c]);
      R.tables.push({
        head: ['Month', 'Visits', '% of total', 'Change vs prior', '% change', 'P1', 'P2', 'P3', 'P4'],
        body: per.map((x, i) => { const d = deltas[i], pv = i ? per[i - 1].n : 0;
          return [monthLabel(x.m), nf(x.n), pct(x.n, data.length), d == null ? '–' : (d > 0 ? '+' : '') + d,
            d == null || !pv ? '–' : (d > 0 ? '+' : '') + (d / pv * 100).toFixed(1) + '%', ...PRIO.map((_, p) => { const n = byPrio(x.r, p).length; return n ? String(n) : '–'; })]; }),
        foot: ['Total', nf(data.length), '100.0%', '–', '–', ...PRIO.map((_, p) => nf(byPrio(data, p).length))]
      });
    }
    if (id === 'tr-state' || id === 'tr-city') {
      const isCity = id === 'tr-city';
      R.title = isCity ? 'Month on month by city' : 'Month on month by state';
      const map = new Map<string, { k: string; t: Ticket; m: Record<string, number>; n: number; rank: number }>();
      data.forEach(t => {
        const k = isCity ? t.city + '|' + t.state : t.state;
        if (!map.has(k)) map.set(k, { k, t, m: {}, n: 0, rank: 0 });
        const o = map.get(k)!; o.m[t.monthKey] = (o.m[t.monthKey] || 0) + 1; o.n++;
      });
      const list = Array.from(map.values()).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
      list.forEach((o, i) => (o.rank = i && o.n === list[i - 1].n ? list[i - 1].rank : i + 1));
      const top = list.slice(0, 10);
      R.chart = stackChart(top.map(o => (isCity ? o.t.city : o.t.stateCode).slice(0, 10)), [{ k: 'Visits', c: '--brand', values: top.map(o => o.n) }]);
      R.kpis = [[isCity ? 'Cities' : 'States', String(list.length), 'with at least one visit'], ['Top 10 share', pct(top.reduce((a, o) => a + o.n, 0), data.length), 'of all visits']];
      let cum = 0;
      R.tables.push({
        head: ['Rank', isCity ? 'City' : 'State', isCity ? 'State' : 'Code', 'Region', ...ms.map(monthShort), 'Total', '% of total', 'Cumulative %'],
        body: list.slice(0, compact ? 10 : list.length).map(o => { cum += o.n;
          return [String(o.rank), isCity ? o.t.city : o.t.state, o.t.stateCode, o.t.region, ...ms.map(m => o.m[m] ? String(o.m[m]) : '–'), String(o.n), pct(o.n, data.length), pct(cum, data.length)]; })
      });
      R.note = compact ? `Top 10 of ${list.length} ${isCity ? 'cities' : 'states'}. Choose "Full detail" when exporting for the complete list.`
        : `Chart shows the top 10 ${isCity ? 'cities' : 'states'}; the table lists all ${list.length}.`;
    }
    if (id === 'tickets') {
      R.title = 'Tickets';
      const rows = data.slice().sort((a, b) => b.created.getTime() - a.created.getTime());
      R.kpis = STATUSES.map(s => [s, nf(rows.filter(t => STATUS_OF[t.stage] === s).length), 'tickets']);
      R.tables.push({
        head: ['Work order', 'Client ticket', 'Visit type', 'Status', 'Raised on', 'Priority', 'City', 'State', 'Region', 'Visit time'],
        body: rows.slice(0, compact ? 20 : rows.length).map(t => [t.id, t.clientTicket, TYPES[typeOf(t)].k, t.statusName || STATUS_OF[t.stage], this.fmtDate(t.created),
          t.pr, t.city, t.state, t.region, t.stage === 'completed' ? hrs(t.hours) : '–']),
        long: !compact
      });
      if (compact) R.note = `The 20 most recent of ${nf(rows.length)} tickets. Choose "Full detail" for every ticket.`;
    }
    if (id === 'he') {
      R.title = 'High effort areas';
      R.kpis = [['Remote areas', String(this.he.length), 'very remote locations'], ['Dispatches', String(this.heTotal), 'to these areas']];
      R.tables.push({
        head: ['#', 'City / area', 'State', 'Zip', 'Nearest city (60,000+)', 'Dispatches'],
        body: this.he.map(r => [String(r.rank), r.city, r.state, r.pin, r.nearest, String(r.n.v)]),
        foot: ['', 'Total', '', '', '', String(this.heTotal)]
      });
    }
    return R;
  }
}
