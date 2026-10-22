import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService, PortalData } from '../../core/data.service';
import { downloadCsv, fmtDate, lastTwelveMonths, monthLabel, monthShort, money, nf, pct } from '../../core/format';
import { OPEN_STAGES, PRC, PRIORITIES, Priority, STAGES, StageKey, Ticket, VISIT_TYPES, stageOf } from '../../core/models';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';

interface Filters {
  months: string[];
  region: string;
  state: string;
  city: string;
  pr: Priority[];
  sla: 'All' | 'Met' | 'Breached';
  visitType: string;
  service: string;
  tech: string;
  source: string;
  ageMax: number;
  stage: StageKey | null;
}

type GroupKey = 'state' | 'city' | 'region' | 'priority' | 'visitType' | 'service' | 'tech' | 'source';
interface GroupDef { k: GroupKey; label: string; header: string; key: (t: Ticket) => string; name: (t: Ticket) => string; sub: (t: Ticket) => string; }
interface GroupRow { key: string; name: string; sub: string; cells: number[]; total: number; }
interface SavedView { name: string; meta: string; filters: Filters; group: GroupKey; }

const SECTIONS = [
  { k: 'trend', label: 'Month-on-month trend', desc: 'Bars + priority / SLA mix' },
  { k: 'breakdown', label: 'Ranked breakdown', desc: 'Grouped table with month columns' },
  { k: 'remote', label: 'High effort areas', desc: 'Very remote dispatch locations' },
  { k: 'detail', label: 'Ticket-level detail', desc: 'One row per work order' }
] as const;
type SectionKey = typeof SECTIONS[number]['k'];

const COLUMNS = [
  { k: 'region', label: 'Region' }, { k: 'service', label: 'Service' }, { k: 'tech', label: 'Technician' },
  { k: 'source', label: 'Source' }, { k: 'visitType', label: 'Visit type' }, { k: 'billed', label: 'Billed' }
] as const;
type ColumnKey = typeof COLUMNS[number]['k'];

@Component({
  selector: 'cp-dashboard',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly STAGES = STAGES;
  readonly PRIORITIES = PRIORITIES;
  readonly PRC = PRC;
  readonly VISIT_TYPES = VISIT_TYPES;
  readonly SECTIONS = SECTIONS;
  readonly COLUMNS = COLUMNS;
  readonly allMonths = lastTwelveMonths();
  readonly monthLabel = monthLabel;
  readonly monthShort = monthShort;
  readonly nf = nf;
  readonly money = money;
  readonly pct = pct;
  readonly fmtDate = fmtDate;
  readonly stageOf = stageOf;

  loading = true;
  error = '';
  customerName = '';
  all: Ticket[] = [];
  remoteAreas: PortalData['remoteAreas'] = [];

  f: Filters = this.blankFilters();
  moreOpen = false;
  trendMode: 'priority' | 'sla' = 'priority';
  group: GroupKey = 'state';
  sortKey: 'total' | number = 'total';
  sortDir: 'asc' | 'desc' = 'desc';
  topN = 15;
  dSort: 'date' | 'hours' | 'billed' | 'age' = 'date';
  dDir: 'asc' | 'desc' = 'desc';
  page = 1;
  perPage = 10;

  show: Record<SectionKey, boolean> = { trend: true, breakdown: true, remote: true, detail: true };
  cols: Record<ColumnKey, boolean> = { region: false, service: true, tech: true, source: false, visitType: true, billed: false };
  customizeOpen = false;
  exportOpen = false;
  exportScope: 'detail' | 'breakdown' | 'summary' = 'detail';
  saveOpen = false;
  saveName = '';
  saved: SavedView[] = [];

  // View model, rebuilt by recompute()
  rows: Ticket[] = [];
  months: string[] = [];
  counts: Record<StageKey, number> = {} as any;
  metN = 0;
  bars: { key: string; label: string; value: number; height: number; isolated: boolean; delta: number | null; segs: { h: number; fill: string }[] }[] = [];
  legend: { label: string; fill: string; value: number }[] = [];
  maxBar = 1;
  mix: { label: Priority; desc: string; n: number; w: number; fill: string }[] = [];
  slaPct = 0;
  groupDef!: GroupDef;
  groupRows: GroupRow[] = [];
  shownRows: GroupRow[] = [];
  footCells: number[] = [];
  footTotal = 0;
  grandMax = 1;
  remoteRows: { city: string; state: string; pin: string; nearest: string; n: number }[] = [];
  remoteHits = 0;
  sorted: Ticket[] = [];
  pageRows: Ticket[] = [];
  pages = 1;
  activeChips: { label: string; clear: () => void }[] = [];
  regionOpts: string[] = [];
  stateOpts: { v: string; t: string }[] = [];
  serviceOpts: string[] = [];
  techOpts: string[] = [];
  sourceOpts: string[] = [];
  ageCap = 30;

  readonly groupDefs: GroupDef[] = [
    { k: 'state', label: 'State', header: 'State', key: t => t.state, name: t => t.state, sub: t => t.stateCode + ' · ' + t.region },
    { k: 'city', label: 'City', header: 'City', key: t => t.city + '|' + t.state, name: t => t.city, sub: t => t.state + ' · ' + t.region },
    { k: 'region', label: 'Region', header: 'Region', key: t => t.region, name: t => t.region, sub: () => 'US region' },
    { k: 'priority', label: 'Priority', header: 'Priority', key: t => t.pr, name: t => t.pr, sub: t => PRC[t.pr].desc },
    { k: 'visitType', label: 'Visit type', header: 'Type of visit', key: t => t.visitType, name: t => t.visitType, sub: () => 'Type of visit' },
    { k: 'service', label: 'Service', header: 'Service', key: t => t.service, name: t => t.service, sub: () => 'Service' },
    { k: 'tech', label: 'Technician', header: 'Technician', key: t => t.technician, name: t => t.technician, sub: () => 'Field technician' },
    { k: 'source', label: 'Source', header: 'Ticket source', key: t => t.source, name: t => t.source, sub: () => 'Intake channel' }
  ];

  private sub?: Subscription;
  private readonly prefKey: string;

  constructor(private data: DataService, private toast: ToastService, session: SessionService) {
    this.prefKey = 'cp_dash_' + (session.session?.kind || '') + '_' + (session.session?.userId || '');
    this.loadPrefs();
  }

  private customiseSub?: Subscription;

  ngOnInit(): void {
    this.customiseSub = this.data.customise$.subscribe(() => (this.customizeOpen = true));
    this.sub = this.data.watch().subscribe({
      next: d => {
        this.loading = false;
        this.error = '';
        this.customerName = d.customerName;
        this.all = d.tickets.filter(t => this.allMonths.includes(t.monthKey));
        this.remoteAreas = d.remoteAreas;
        this.buildOptions();
        this.recompute();
      },
      error: err => {
        this.loading = false;
        this.error = err?.message || 'Could not load work orders.';
      }
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); this.customiseSub?.unsubscribe(); }

  // ---- Filters ---------------------------------------------------------------
  blankFilters(): Filters {
    return { months: lastTwelveMonths(), region: '', state: '', city: '', pr: [], sla: 'All', visitType: '', service: '', tech: '', source: '', ageMax: 9999, stage: null };
  }

  set<K extends keyof Filters>(key: K, value: Filters[K]): void {
    this.f = { ...this.f, [key]: value };
    this.page = 1;
    this.recompute();
  }

  toggleMonth(k: string): void {
    const on = this.f.months.includes(k);
    const next = on ? this.f.months.filter(x => x !== k) : this.allMonths.filter(x => this.f.months.includes(x) || x === k);
    if (next.length) this.set('months', next);
  }
  togglePriority(p: Priority): void {
    this.set('pr', this.f.pr.includes(p) ? this.f.pr.filter(x => x !== p) : [...this.f.pr, p]);
  }
  toggleStage(k: StageKey): void { this.set('stage', this.f.stage === k ? null : k); }
  isolateMonth(k: string): void {
    const isolated = this.f.months.length === 1 && this.f.months[0] === k;
    this.set('months', isolated ? [...this.allMonths] : [k]);
  }
  clearAll(): void { this.f = this.blankFilters(); this.page = 1; this.recompute(); }

  private buildOptions(): void {
    const uniq = (xs: string[]) => Array.from(new Set(xs)).filter(Boolean).sort();
    this.regionOpts = uniq(this.all.map(t => t.region));
    const byState: Record<string, number> = {};
    this.all.forEach(t => (byState[t.state] = (byState[t.state] || 0) + 1));
    this.stateOpts = Object.keys(byState).sort((a, b) => byState[b] - byState[a]).map(s => ({ v: s, t: `${s} (${byState[s]})` }));
    this.serviceOpts = uniq(this.all.map(t => t.service));
    this.techOpts = uniq(this.all.filter(t => t.hasTechnician).map(t => t.technician));
    this.sourceOpts = uniq(this.all.map(t => t.source));
    this.ageCap = Math.max(30, ...this.all.map(t => t.age));
  }

  private matches(t: Ticket, skipStage = false): boolean {
    const f = this.f;
    const city = f.city.trim().toLowerCase();
    if (!f.months.includes(t.monthKey)) return false;
    if (f.region && t.region !== f.region) return false;
    if (f.state && t.state !== f.state) return false;
    if (city && !t.city.toLowerCase().includes(city)) return false;
    if (f.pr.length && !f.pr.includes(t.pr)) return false;
    if (f.sla === 'Met' && !t.slaMet) return false;
    if (f.sla === 'Breached' && t.slaMet) return false;
    if (f.visitType && t.visitType !== f.visitType) return false;
    if (f.service && t.service !== f.service) return false;
    if (f.tech && t.technician !== f.tech) return false;
    if (f.source && t.source !== f.source) return false;
    if (t.age > f.ageMax) return false;
    if (!skipStage && f.stage && t.stage !== f.stage) return false;
    return true;
  }

  // ---- View model --------------------------------------------------------------
  recompute(): void {
    const f = this.f;
    // Stage cards count everything else in the filter, so picking a stage keeps the others visible.
    const beforeStage = this.all.filter(t => this.matches(t, true));
    this.counts = STAGES.reduce((acc, s) => ({ ...acc, [s.k]: 0 }), {} as Record<StageKey, number>);
    beforeStage.forEach(t => this.counts[t.stage]++);
    const rows = f.stage ? beforeStage.filter(t => t.stage === f.stage) : beforeStage;
    this.rows = rows;
    this.months = this.allMonths.filter(k => f.months.includes(k));
    this.metN = rows.filter(t => t.slaMet).length;
    this.slaPct = rows.length ? this.metN / rows.length * 100 : 0;

    // Trend
    const byMonth = this.months.map(k => rows.filter(t => t.monthKey === k));
    this.maxBar = Math.max(1, ...byMonth.map(m => m.length));
    this.bars = this.months.map((k, i) => {
      const set = byMonth[i];
      const segs = this.trendMode === 'priority'
        ? PRIORITIES.map(p => ({ n: set.filter(t => t.pr === p).length, fill: PRC[p].fill }))
        : [{ n: set.filter(t => t.slaMet).length, fill: '#1F7A4D' }, { n: set.filter(t => !t.slaMet).length, fill: '#B0102A' }];
      return {
        key: k, label: monthShort(k), value: set.length,
        height: Math.round(set.length / this.maxBar * 178),
        isolated: f.months.length === 1 && f.months[0] === k,
        delta: i > 0 ? set.length - byMonth[i - 1].length : null,
        segs: segs.filter(g => g.n > 0).map(g => ({ h: g.n / Math.max(1, set.length) * 100, fill: g.fill }))
      };
    });
    this.legend = this.trendMode === 'priority'
      ? PRIORITIES.map(p => ({ label: p, fill: PRC[p].fill, value: rows.filter(t => t.pr === p).length }))
      : [{ label: 'SLA met', fill: '#1F7A4D', value: this.metN }, { label: 'Breached', fill: '#B0102A', value: rows.length - this.metN }];
    this.mix = PRIORITIES.map(p => {
      const n = rows.filter(t => t.pr === p).length;
      return { label: p, desc: PRC[p].desc, n, w: rows.length ? n / rows.length * 100 : 0, fill: PRC[p].fill };
    });

    // Breakdown
    this.groupDef = this.groupDefs.find(g => g.k === this.group)!;
    const map: Record<string, GroupRow> = {};
    rows.forEach(t => {
      const key = this.groupDef.key(t);
      if (!map[key]) map[key] = { key, name: this.groupDef.name(t), sub: this.groupDef.sub(t), cells: this.months.map(() => 0), total: 0 };
      const i = this.months.indexOf(t.monthKey);
      if (i >= 0) map[key].cells[i]++;
      map[key].total++;
    });
    const dir = this.sortDir === 'asc' ? 1 : -1;
    this.groupRows = Object.values(map).sort((a, b) => {
      const av = this.sortKey === 'total' ? a.total : a.cells[this.sortKey] || 0;
      const bv = this.sortKey === 'total' ? b.total : b.cells[this.sortKey] || 0;
      return (av - bv) * dir || a.name.localeCompare(b.name);
    });
    this.shownRows = this.groupRows.slice(0, this.topN);
    this.grandMax = Math.max(1, ...this.groupRows.map(r => r.total));
    this.footCells = this.months.map((_, i) => this.shownRows.reduce((a, r) => a + r.cells[i], 0));
    this.footTotal = this.shownRows.reduce((a, r) => a + r.total, 0);

    // Remote areas, matched to tickets by 5-digit zip
    const hits: Record<string, number> = {};
    rows.forEach(t => { if (t.pin) hits[t.pin] = (hits[t.pin] || 0) + 1; });
    this.remoteRows = this.remoteAreas
      .filter(a => !f.state || a.state.toLowerCase() === f.state.toLowerCase())
      .map(a => ({ ...a, n: hits[a.pin] || 0 }))
      .sort((a, b) => b.n - a.n || a.city.localeCompare(b.city));
    this.remoteHits = this.remoteRows.reduce((a, r) => a + r.n, 0);

    // Detail
    const dd = this.dDir === 'asc' ? 1 : -1;
    this.sorted = rows.slice().sort((a, b) => {
      if (this.dSort === 'hours') return ((a.hours ?? -1) - (b.hours ?? -1)) * dd;
      if (this.dSort === 'billed') return (a.billed - b.billed) * dd;
      if (this.dSort === 'age') return (a.age - b.age) * dd;
      return (a.created.getTime() - b.created.getTime()) * dd;
    });
    this.pages = Math.max(1, Math.ceil(this.sorted.length / this.perPage));
    this.page = Math.min(this.page, this.pages);
    this.pageRows = this.sorted.slice((this.page - 1) * this.perPage, this.page * this.perPage);

    this.activeChips = this.buildChips();
  }

  private buildChips(): { label: string; clear: () => void }[] {
    const f = this.f, c: { label: string; clear: () => void }[] = [];
    if (f.stage) c.push({ label: 'Stage: ' + stageOf(f.stage).label, clear: () => this.set('stage', null) });
    if (f.region) c.push({ label: 'Region: ' + f.region, clear: () => this.set('region', '') });
    if (f.state) c.push({ label: 'State: ' + f.state, clear: () => this.set('state', '') });
    if (f.city) c.push({ label: 'City ~ ' + f.city, clear: () => this.set('city', '') });
    if (f.pr.length) c.push({ label: 'Priority: ' + f.pr.join(', '), clear: () => this.set('pr', []) });
    if (f.sla !== 'All') c.push({ label: 'SLA: ' + f.sla, clear: () => this.set('sla', 'All') });
    if (f.visitType) c.push({ label: f.visitType, clear: () => this.set('visitType', '') });
    if (f.service) c.push({ label: 'Service: ' + f.service, clear: () => this.set('service', '') });
    if (f.tech) c.push({ label: 'Technician: ' + f.tech, clear: () => this.set('tech', '') });
    if (f.source) c.push({ label: 'Source: ' + f.source, clear: () => this.set('source', '') });
    if (f.ageMax < this.ageCap) c.push({ label: 'Ageing ≤ ' + f.ageMax + 'd', clear: () => this.set('ageMax', 9999) });
    if (f.months.length < this.allMonths.length) c.push({ label: f.months.length + ' of 12 months', clear: () => this.set('months', [...this.allMonths]) });
    return c;
  }

  // ---- Interactions ------------------------------------------------------------
  setTrend(mode: 'priority' | 'sla'): void { this.trendMode = mode; this.recompute(); }
  setGroup(k: GroupKey): void { this.group = k; this.sortKey = 'total'; this.sortDir = 'desc'; this.savePrefs(); this.recompute(); }
  sortBy(key: 'total' | number): void {
    this.sortDir = this.sortKey === key && this.sortDir === 'desc' ? 'asc' : 'desc';
    this.sortKey = key;
    this.recompute();
  }
  setTopN(n: number): void { this.topN = Number(n); this.recompute(); }
  sortDetail(key: 'date' | 'hours' | 'billed' | 'age'): void {
    this.dDir = this.dSort === key && this.dDir === 'desc' ? 'asc' : 'desc';
    this.dSort = key;
    this.recompute();
  }
  setPerPage(n: number): void { this.perPage = Number(n); this.page = 1; this.recompute(); }
  goPage(p: number): void { this.page = Math.min(this.pages, Math.max(1, p)); this.recompute(); }
  arrow(active: boolean, dir: 'asc' | 'desc'): string { return active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''; }

  /** Clicking a breakdown row filters the whole dashboard to it. */
  drill(r: GroupRow): void {
    const t = this.rows.find(x => this.groupDef.key(x) === r.key);
    if (!t) return;
    switch (this.group) {
      case 'state': return this.set('state', t.state);
      case 'city': this.f = { ...this.f, state: t.state }; return this.set('city', t.city);
      case 'region': return this.set('region', t.region);
      case 'priority': return this.set('pr', [t.pr]);
      case 'visitType': return this.set('visitType', t.visitType);
      case 'service': return this.set('service', t.service);
      case 'tech': return this.set('tech', t.technician);
      case 'source': return this.set('source', t.source);
    }
  }

  get headline(): string {
    const label = this.months.length === this.allMonths.length
      ? 'last 12 months'
      : this.months.length <= 3 ? this.months.map(monthLabel).join(', ') : this.months.length + ' months';
    return `${nf(this.rows.length)} work orders · ${label} · ${pct(this.metN, this.rows.length)} within SLA`;
  }
  get openCount(): number { return OPEN_STAGES.reduce((a, k) => a + (this.counts[k] || 0), 0); }
  get slaRing(): string {
    const p = this.slaPct.toFixed(1);
    return `conic-gradient(#1F7A4D 0 ${p}%, #B0102A ${p}% 100%)`;
  }

  // ---- Customise / saved views (kept per browser and user) ------------------
  toggleSection(k: SectionKey): void { this.show = { ...this.show, [k]: !this.show[k] }; this.savePrefs(); }
  toggleColumn(k: ColumnKey): void { this.cols = { ...this.cols, [k]: !this.cols[k] }; this.savePrefs(); }

  saveView(): void {
    const name = this.saveName.trim() || 'Untitled view';
    const meta = this.months.length + ' months · by ' + this.groupDef.label.toLowerCase();
    this.saved = [...this.saved.filter(v => v.name !== name), { name, meta, filters: { ...this.f, months: [...this.f.months] }, group: this.group }];
    this.saveOpen = false;
    this.saveName = '';
    this.savePrefs();
    this.toast.show('Saved “' + name + '”');
  }
  applyView(v: SavedView): void {
    // Saved month keys may have rolled out of the 12-month window.
    const months = v.filters.months.filter(k => this.allMonths.includes(k));
    this.f = { ...this.blankFilters(), ...v.filters, months: months.length ? months : [...this.allMonths] };
    this.group = v.group;
    this.page = 1;
    this.recompute();
    this.toast.show('Applied “' + v.name + '”');
  }
  removeView(v: SavedView, ev: Event): void {
    ev.stopPropagation();
    this.saved = this.saved.filter(x => x !== v);
    this.savePrefs();
  }

  private loadPrefs(): void {
    try {
      const p = JSON.parse(localStorage.getItem(this.prefKey) || '{}');
      if (p.show) this.show = { ...this.show, ...p.show };
      if (p.cols) this.cols = { ...this.cols, ...p.cols };
      if (p.group) this.group = p.group;
      if (Array.isArray(p.saved)) this.saved = p.saved;
    } catch { /* storage unavailable */ }
  }
  private savePrefs(): void {
    try {
      localStorage.setItem(this.prefKey, JSON.stringify({ show: this.show, cols: this.cols, group: this.group, saved: this.saved }));
    } catch { /* storage unavailable */ }
  }

  // ---- Export --------------------------------------------------------------------
  runExport(): void {
    if (this.exportScope === 'detail') this.exportDetail();
    else if (this.exportScope === 'breakdown') this.exportBreakdown();
    else this.exportSummary();
    this.exportOpen = false;
  }

  exportDetail(): void {
    const head = ['Work order', 'Client ticket', 'Created', 'Visit date', 'Customer', 'City', 'State', 'Region', 'Priority', 'Priority name',
      'Stage', 'Type of visit', 'Service', 'Technician', 'Source', 'Visit hours', 'Ageing (days)', 'Billed', 'SLA', 'SLA reason'];
    downloadCsv([head, ...this.sorted.map(t => [t.id, t.clientTicket, fmtDate(t.created), fmtDate(t.visit), t.customer, t.city, t.state, t.region,
      t.pr, t.priorityName, stageOf(t.stage).label, t.visitType, t.service, t.technician, t.source, t.hours, t.age, t.billed,
      t.slaMet ? 'Met' : 'Breached', t.slaReason])], 'work-orders-detail.csv');
    this.toast.show('Exported ' + nf(this.sorted.length) + ' work orders');
  }

  exportBreakdown(): void {
    const head = ['Rank', this.groupDef.header, ...this.months.map(monthLabel), 'Total', '% of total'];
    downloadCsv([head, ...this.groupRows.map((r, i) => [i + 1, r.name, ...r.cells, r.total, pct(r.total, this.rows.length)])],
      'work-orders-by-' + this.group + '.csv');
    this.toast.show('Exported breakdown by ' + this.groupDef.label.toLowerCase());
  }

  exportSummary(): void {
    const total = STAGES.reduce((a, s) => a + this.counts[s.k], 0);
    downloadCsv([
      ['Stage', 'Work orders', '% of total'],
      ...STAGES.map(s => [s.label, this.counts[s.k], pct(this.counts[s.k], total)]),
      [],
      ['Measure', 'Value'],
      ['Work orders', this.rows.length],
      ['Open', this.openCount],
      ['SLA met', pct(this.metN, this.rows.length)],
      ['SLA breached', this.rows.length - this.metN]
    ], 'work-orders-summary.csv');
    this.toast.show('Exported stage summary');
  }
}
