import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, skip } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { CustomerOption, DataService } from '../../core/data.service';
import { downloadCsv, isoDate, nf, siteDateTime } from '../../core/format';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';

/** One row of customerDashboard/orders (same columns as the admin panel's Raise tickets list). */
interface OrderRow {
  ID: number;
  ORDER_NUMBER: string;
  CUSTOMER_ID: number;
  CUSTOMER_TYPE: string;
  COMPANY_NAME: string;
  CUSTOMER_NAME: string;
  IS_PARENT: number;
  MOBILE_NO: string;
  ADDRESS_LINE_1: string;
  ADDRESS_LINE_2: string;
  SITE_NUMBER: string;
  CITY_NAME: string;
  STATE_NAME: string;
  PINCODE: string;
  COUNTRY_NAME: string;
  PRIORITY_NAME: string;
  ORDER_DATE_TIME: string;
  EXPECTED_DATE_TIME: string;
  IANA_CODE: string;
  ORDER_STATUS: string;
  ORDER_STATUS_ID: number;
  ORDER_STATUS_NAME: string;
  REFUND_STATUS: string | null;
  TECHNICIAN_STATUS: string | null;
  ORDER_TYPE: string;
  GUEST_TECHNICIAN_NAME: string;
  GUEST_TECHNICIAN_CONTACT: string;
}

interface Tech { NAME: string; MOBILE_NUMBER: string; }

interface Card {
  row: OrderRow;
  org: string;
  contact: string;
  showContact: boolean;
  address: string;
  techSummary: string;
  techNames: string;
  techMobiles: string;
  hasTech: boolean;
  created: { date: string; time: string; full: string };
  preferred: { date: string; time: string; full: string };
  status: { label: string; color: string };
  canEdit: boolean;
}

const PAGE_SIZE = 12;

@Component({
  selector: 'cp-work-orders',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule],
  templateUrl: './work-orders.component.html',
  styleUrls: ['./work-orders.component.css']
})
export class WorkOrdersComponent implements OnInit, OnDestroy {
  readonly nf = nf;
  readonly statusOptions = [
    { id: 1, label: 'Work Order Created' }, { id: 2, label: 'Accepted' }, { id: 3, label: 'Rejected' },
    { id: 4, label: 'Scheduled' }, { id: 5, label: 'Ongoing' }, { id: 6, label: 'Completed' }, { id: 7, label: 'Cancelled' }
  ];
  readonly datePresets = [
    { value: 'all', label: 'All time' }, { value: 'today', label: 'Today' }, { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' }, { value: 'month', label: 'This month' }, { value: '90', label: 'Last 90 days' }
  ];

  view: 'grid' | 'list' = 'grid';
  search = '';
  filtersOpen = false;
  status: number | null = null;
  datePreset = 'all';
  fromDate = '';
  toDate = '';
  customerId: number | null = null;
  customers: CustomerOption[] = [];
  isStaff = false;

  cards: Card[] = [];
  total = 0;
  pageIndex = 1;
  loading = false;
  exporting = false;

  private subs: Subscription[] = [];
  private readonly viewKey: string;

  constructor(
    private api: ApiService,
    private data: DataService,
    private route: ActivatedRoute,
    public router: Router,
    private toast: ToastService,
    session: SessionService
  ) {
    this.viewKey = 'cp_wo_view_' + (session.session?.userId || '');
    try { if (localStorage.getItem(this.viewKey) === 'list') this.view = 'list'; } catch { /* ignore */ }
  }

  ngOnInit(): void {
    this.isStaff = this.data.isStaff;
    this.customerId = this.data.selectedCustomer$.value;
    if (this.isStaff) this.subs.push(this.data.customers().subscribe(c => (this.customers = c)));
    this.search = this.route.snapshot.queryParamMap.get('q') || '';
    this.reload();
    // The header's customer picker narrows the list too.
    this.subs.push(this.data.selectedCustomer$.pipe(skip(1)).subscribe(id => { this.customerId = id; this.reload(); }));
    // The header search lands here with ?q=.
    this.subs.push(this.route.queryParamMap.pipe(skip(1)).subscribe(p => {
      const q = p.get('q') || '';
      if (q !== this.search) { this.search = q; this.reload(); }
    }));
  }
  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  get dateLabel(): string {
    if (this.datePreset === 'custom') return (this.fromDate || '…') + ' – ' + (this.toDate || '…');
    return this.datePresets.find(p => p.value === this.datePreset)?.label || 'All time';
  }
  get activeFilterCount(): number {
    return (this.status ? 1 : 0) + (this.datePreset !== 'all' ? 1 : 0) + (this.isStaff && this.customerId ? 1 : 0);
  }

  private query(pageIndex: number, pageSize: number) {
    const range = this.range();
    return {
      pageIndex, pageSize,
      search: this.search.trim().length >= 3 ? this.search.trim() : '',
      STATUS_IDS: this.status ? [this.status] : [],
      FROM_DATE: range.from, TO_DATE: range.to,
      CUSTOMER_ID: this.isStaff ? this.customerId : null
    };
  }

  private range(): { from: string; to: string } {
    const today = new Date();
    const back = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return isoDate(d); };
    switch (this.datePreset) {
      case 'today': return { from: isoDate(today), to: isoDate(today) };
      case '7': return { from: back(6), to: isoDate(today) };
      case '30': return { from: back(29), to: isoDate(today) };
      case '90': return { from: back(89), to: isoDate(today) };
      case 'month': return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDate(today) };
      case 'custom': return { from: this.fromDate, to: this.toDate };
      default: return { from: '', to: '' };
    }
  }

  reload(): void {
    this.pageIndex = 1;
    this.cards = [];
    this.fetch();
  }

  loadMore(): void {
    this.pageIndex++;
    this.fetch();
  }

  private fetch(): void {
    this.loading = true;
    this.api.orders(this.query(this.pageIndex, PAGE_SIZE)).subscribe({
      next: (r: any) => {
        this.loading = false;
        if (r?.code !== 200) { this.toast.error(r?.message || 'Could not load work orders'); return; }
        this.total = r.count || 0;
        const techs: Record<string, Tech[]> = r.technicians || {};
        this.cards = [...this.cards, ...(r.data || []).map((row: OrderRow) => this.toCard(row, techs[String(row.ID)] || []))];
      },
      error: err => { this.loading = false; this.toast.error(err?.error?.message || 'Could not load work orders'); }
    });
  }

  onSearchKey(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' && (this.search.trim().length >= 3 || !this.search.trim())) this.runSearch();
    else if (!this.search.trim() && ev.key === 'Backspace') this.runSearch();
  }
  runSearch(): void {
    if (this.search.trim() && this.search.trim().length < 3) { this.toast.error('Type at least 3 characters to search'); return; }
    this.router.navigate([], { queryParams: this.search.trim() ? { q: this.search.trim() } : {}, replaceUrl: true });
    this.reload();
  }

  selectPreset(v: string): void { this.datePreset = v; if (v !== 'custom') { this.fromDate = this.toDate = ''; } this.reload(); }
  applyCustomRange(): void { if (this.fromDate || this.toDate) { this.datePreset = 'custom'; this.reload(); } }
  onStatus(v: number | null): void { this.status = v; this.reload(); }
  onCustomer(v: number | null): void { this.data.selectCustomer(v); }
  resetAll(): void {
    this.status = null;
    this.datePreset = 'all';
    this.fromDate = this.toDate = '';
    this.search = '';
    if (this.isStaff && this.customerId) this.data.selectCustomer(null);
    else this.runSearch();
  }

  setView(v: 'grid' | 'list'): void {
    this.view = v;
    try { localStorage.setItem(this.viewKey, v); } catch { /* ignore */ }
  }

  raise(): void { this.router.navigate(['/raise-ticket']); }
  /** Opens Work Order Details (the panel opens its details drawer from the list). */
  openOrder(c: Card): void { this.router.navigate(['/work-order', c.row.ID]); }
  /** As the panel: only a created order nobody has accepted, with no cancellation pending. */
  canEdit(c: Card): boolean {
    const r = c.row as any;
    return r.ORDER_STATUS === 'OP' && (r.REFUND_STATUS == null || r.REFUND_STATUS === '' || r.REFUND_STATUS === 'R');
  }
  edit(c: Card, ev?: Event): void {
    ev?.stopPropagation();
    this.router.navigate(['/raise-ticket'], { queryParams: { edit: c.row.ID } });
  }
  duplicate(c: Card, ev?: Event): void {
    ev?.stopPropagation();
    this.router.navigate(['/raise-ticket'], { queryParams: { duplicate: c.row.ID } });
  }

  private toCard(row: OrderRow, techs: Tech[]): Card {
    const list: Tech[] = row.ORDER_TYPE === 'G'
      ? (row.GUEST_TECHNICIAN_NAME ? [{ NAME: row.GUEST_TECHNICIAN_NAME, MOBILE_NUMBER: row.GUEST_TECHNICIAN_CONTACT }] : [])
      : techs;
    const address = (row.ADDRESS_LINE_1 || '')
      + (row.ADDRESS_LINE_2 ? ', ' + row.ADDRESS_LINE_2 : '')
      + (row.SITE_NUMBER ? ', ' + row.SITE_NUMBER : '')
      + (row.CITY_NAME ? ', ' + row.CITY_NAME : '')
      + (row.STATE_NAME ? ', ' + row.STATE_NAME : '')
      + (row.PINCODE ? ' - ' + row.PINCODE : '')
      + (row.COUNTRY_NAME ? ', ' + row.COUNTRY_NAME : '');
    const pending = row.ORDER_STATUS === 'OP' && (row.REFUND_STATUS == null || row.REFUND_STATUS === 'R');
    return {
      row,
      org: row.CUSTOMER_TYPE !== 'I' ? row.COMPANY_NAME : row.CUSTOMER_NAME,
      contact: row.CUSTOMER_NAME,
      showContact: row.CUSTOMER_TYPE === 'B' && !row.IS_PARENT,
      address: address.replace(/^, /, ''),
      techSummary: list.length ? list.map(t => t.MOBILE_NUMBER ? `${t.NAME} (${t.MOBILE_NUMBER})` : t.NAME).join(', ') : 'Not assigned yet',
      techNames: list.length ? list.map(t => t.NAME).join(', ') : 'Not assigned yet',
      techMobiles: list.filter(t => t.MOBILE_NUMBER).map(t => t.MOBILE_NUMBER).join(', '),
      hasTech: list.length > 0,
      created: siteDateTime(row.ORDER_DATE_TIME, row.IANA_CODE),
      preferred: siteDateTime(row.EXPECTED_DATE_TIME, row.IANA_CODE),
      status: statusTag(row),
      canEdit: pending
    };
  }

  /** Every row matching the current filters, not just the loaded pages. */
  exportCsv(): void {
    this.exporting = true;
    const rows: Card[] = [];
    const page = (index: number) => {
      this.api.orders(this.query(index, 100)).subscribe({
        next: (r: any) => {
          if (r?.code !== 200) { this.exporting = false; this.toast.error(r?.message || 'Export failed'); return; }
          const techs: Record<string, Tech[]> = r.technicians || {};
          rows.push(...(r.data || []).map((row: OrderRow) => this.toCard(row, techs[String(row.ID)] || [])));
          if (rows.length < (r.count || 0) && (r.data || []).length && index < 50) return page(index + 1);
          this.exporting = false;
          const head = ['Order ID', 'Customer', 'Contact', 'Mobile', 'Service address', 'Technician', 'Technician mobile', 'Preferred', 'Priority', 'Created', 'Status'];
          downloadCsv([head, ...rows.map(c => [c.row.ORDER_NUMBER, c.org, c.contact, c.row.MOBILE_NO, c.address, c.techNames,
            c.techMobiles, c.preferred.full, c.row.PRIORITY_NAME, c.created.full, c.status.label])], 'raise-tickets.csv');
          this.toast.show('Exported ' + nf(rows.length) + ' work orders');
        },
        error: () => { this.exporting = false; this.toast.error('Export failed'); }
      });
    };
    page(1);
  }
}

/** Status tag colours exactly as the admin panel's list. */
function statusTag(r: OrderRow): { label: string; color: string } {
  const s = r.ORDER_STATUS, refund = r.REFUND_STATUS, name = r.ORDER_STATUS_NAME;
  if ((s === 'OP' || s === 'OA') && refund === 'P') return { label: 'Cancel Requested', color: '#d10404' };
  if (s === 'OP') return { label: name, color: '#ff9d19' };
  if (s === 'OA') return { label: name, color: '#00b778' };
  if (s === 'ON') return r.TECHNICIAN_STATUS === 'CO' ? { label: 'Awaiting Service Desk Approval', color: '#0082ff' } : { label: name, color: '#0351ea' };
  if (s === 'OR') return { label: name, color: '#e50000' };
  if (s === 'OS') return { label: name, color: '#0351ea' };
  if (s === 'OC' || s === 'CO') return { label: name, color: '#028d00' };
  if (s === 'C' || s === 'CA') return { label: name, color: '#f70000' };
  return { label: name || '—', color: '#79808C' };
}
