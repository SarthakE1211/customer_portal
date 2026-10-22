import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService } from '../../core/data.service';
import { downloadCsv, fmtDate, fmtTime, isoDate, nf, pct } from '../../core/format';
import { OPEN_STAGES, PRC, PRIORITIES, Priority, STAGES, StageKey, Ticket, VISIT_TYPES, stageOf } from '../../core/models';
import { ToastService } from '../../core/toast.service';

const PER_PAGE = 25;

@Component({
  selector: 'cp-work-order-report',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, RouterLink],
  templateUrl: './work-order-report.component.html',
  styleUrls: ['./work-order-report.component.css']
})
export class WorkOrderReportComponent implements OnInit, OnDestroy {
  readonly STAGES = STAGES;
  readonly PRIORITIES = PRIORITIES;
  readonly PRC = PRC;
  readonly VISIT_TYPES = VISIT_TYPES;
  readonly stageOf = stageOf;
  readonly nf = nf;
  readonly pct = pct;
  readonly fmtDate = fmtDate;
  readonly fmtTime = fmtTime;

  loading = true;
  error = '';
  all: Ticket[] = [];

  from = '';
  to = '';
  state = '';
  visitType = '';
  tech = '';
  prs: Priority[] = [];
  stages: StageKey[] = [];
  sortKey: 'created' | 'visit' = 'created';
  sortDir: 'asc' | 'desc' = 'desc';
  page = 1;

  stateOpts: string[] = [];
  techOpts: string[] = [];
  list: Ticket[] = [];
  pageRows: Ticket[] = [];
  pages = 1;
  counts: Record<string, number> = {};
  openN = 0;
  unassigned = 0;

  private sub?: Subscription;

  constructor(private data: DataService, private toast: ToastService) {
    const today = new Date();
    this.to = isoDate(today);
    this.from = isoDate(new Date(today.getFullYear(), today.getMonth() - 6, 1));
  }

  ngOnInit(): void {
    this.sub = this.data.watch().subscribe({
      next: d => {
        this.loading = false;
        this.all = d.tickets;
        this.stateOpts = Array.from(new Set(d.tickets.map(t => t.state))).sort();
        this.techOpts = Array.from(new Set(d.tickets.filter(t => t.hasTechnician).map(t => t.technician))).sort();
        this.apply();
      },
      error: err => { this.loading = false; this.error = err?.message || 'Could not load work orders.'; }
    });
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  apply(resetPage = true): void {
    if (resetPage) this.page = 1;
    const base = this.all.filter(t => {
      const d = isoDate(t.created);
      if (this.from && d < this.from) return false;
      if (this.to && d > this.to) return false;
      if (this.state && t.state !== this.state) return false;
      if (this.visitType && t.visitType !== this.visitType) return false;
      if (this.tech === '__assigned' && !t.hasTechnician) return false;
      if (this.tech === '__none' && t.hasTechnician) return false;
      if (this.tech && !this.tech.startsWith('__') && t.technician !== this.tech) return false;
      if (this.prs.length && !this.prs.includes(t.pr)) return false;
      return true;
    });
    this.list = base.filter(t => !this.stages.length || this.stages.includes(t.stage));
    this.counts = {};
    this.list.forEach(t => (this.counts[t.stage] = (this.counts[t.stage] || 0) + 1));
    this.openN = OPEN_STAGES.reduce((a, k) => a + (this.counts[k] || 0), 0);
    this.unassigned = this.list.filter(t => !t.hasTechnician).length;

    const dir = this.sortDir === 'asc' ? 1 : -1;
    const key = (t: Ticket) => (this.sortKey === 'visit' ? t.visit : t.created).getTime();
    this.list.sort((a, b) => (key(a) - key(b)) * dir);
    this.pages = Math.max(1, Math.ceil(this.list.length / PER_PAGE));
    this.page = Math.min(this.page, this.pages);
    this.pageRows = this.list.slice((this.page - 1) * PER_PAGE, this.page * PER_PAGE);
  }

  togglePriority(p: Priority): void { this.prs = this.prs.includes(p) ? this.prs.filter(x => x !== p) : [...this.prs, p]; this.apply(); }
  toggleStage(k: StageKey): void { this.stages = this.stages.includes(k) ? this.stages.filter(x => x !== k) : [...this.stages, k]; this.apply(); }
  sortBy(k: 'created' | 'visit'): void {
    this.sortDir = this.sortKey === k && this.sortDir === 'desc' ? 'asc' : 'desc';
    this.sortKey = k;
    this.apply(false);
  }
  arrow(k: 'created' | 'visit'): string { return this.sortKey === k ? (this.sortDir === 'desc' ? ' ↓' : ' ↑') : ''; }
  goPage(p: number): void { this.page = Math.min(this.pages, Math.max(1, p)); this.apply(false); }

  get anyFilter(): boolean {
    return !!(this.state || this.visitType || this.tech || this.prs.length || this.stages.length);
  }
  clear(): void {
    this.state = this.visitType = this.tech = '';
    this.prs = [];
    this.stages = [];
    this.apply();
  }

  get closedN(): number { return (this.counts['cancelled'] || 0) + (this.counts['rejected'] || 0); }
  get pageLabel(): string {
    if (!this.list.length) return 'No rows';
    const start = (this.page - 1) * PER_PAGE + 1;
    return `Showing ${nf(start)}–${nf(Math.min(this.page * PER_PAGE, this.list.length))} of ${nf(this.list.length)}`;
  }
  barWidth(k: StageKey): number { return this.list.length ? (this.counts[k] || 0) / this.list.length * 100 : 0; }

  exportCsv(): void {
    const head = ['Work order', 'Client ticket', 'Created', 'Customer', 'City', 'State', 'Zip', 'Type of visit', 'Service',
      'Technician', 'Visit', 'Priority', 'Priority name', 'Stage', 'Source', 'SLA'];
    downloadCsv([head, ...this.list.map(t => [t.id, t.clientTicket, fmtDate(t.created) + ' ' + fmtTime(t.created), t.customer, t.city, t.state, t.pin,
      t.visitType, t.service, t.technician, fmtDate(t.visit) + ' ' + fmtTime(t.visit), t.pr, t.priorityName, stageOf(t.stage).label, t.source,
      t.slaMet ? 'Met' : 'Breached'])], `customer-work-order-report-${this.from}-to-${this.to}.csv`);
    this.toast.show('Exported ' + nf(this.list.length) + ' work orders');
  }
}
