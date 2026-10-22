import { Component, HostListener, OnInit } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularEditorConfig, AngularEditorModule } from '@kolkov/angular-editor';
import { ActivatedRoute, Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { ApiService } from '../../core/api.service';
import { DataService } from '../../core/data.service';
import { siteDateTime } from '../../core/format';
import { loadGoogleMaps } from '../../core/google-maps';
import { ToastService } from '../../core/toast.service';
import { minutesToReadable } from '../raise-ticket/raise-ticket.component';

interface Spoc { FULL_NAME: string; EMAIL_ID: string; MOBILE_NUMBER: string; IS_PRIMARY: number; }
interface Technician { NAME: string; MOBILE_NUMBER: string; IS_GUEST: number; }
interface Line {
  ID: number; SERVICE_NAME: string; CATEGORY_NAME: string; SUB_CATEGORY_NAME: string; SERVICE_PARENT_NAME: string;
  EXPECTED_DATE_TIME: string; JOB_CARD_ID: number; JOB_CARD_NO: string; SHEDULED_DATETIME: string; ESTIMATED_TIME_IN_MIN: number;
}
interface Job {
  ID: number; JOB_CARD_NO: string; REMARK: string; TASK_DESCRIPTION: string; SITE_VISIT_REPORT_TYPE: string;
  DISPATCH_REPORT_URL: string; QHC_REPORT_URL: string; IS_DISPATCH_REPORT_FILLED: number; IS_QHC_REPORT_FILLED: number;
}
interface Photo { ID: number; PHOTOS_URL: string; }
interface Order {
  ORDER_ID: number; ORDER_NUMBER: string; ORDER_DATE_TIME: string; IANA_CODE: string; ORDER_STATUS: string; REFUND_STATUS: string | null;
  TECHNICIAN_STATUS: string | null; ORDER_TYPE: string | null; CUSTOMER_TYPE: string; CUSTOMER_NAME: string; COMPANY_NAME: string;
  EMAIL: string; MOBILE_NO: string; ADDRESS_LINE_1: string; ADDRESS_LINE_2: string; COUNTRY_NAME: string; STATE_NAME: string;
  PINCODE: string; CITY_NAME: string; SERVICE_ADDRESS: string; SERVICE_LATITUDE: string; SERVICE_LONGITUDE: string; CLIENT_SOURCE_TICKET_NUMBER: string; SPECIAL_INSTRUCTIONS: string; DOCUMENT_NAME: string;
  GUEST_TECHNICIAN_NAME: string; GUEST_TECHNICIAN_CONTACT: string; GUEST_TECHNICIAN_EMAIL: string; GUEST_TECHNICIAN_OTHER_DETAILS: string;
  CAN_EDIT: boolean; TICKET_TYPE: string | null; TICKET_HOURS: number | null; TECH_LEVEL_NAME: string | null;
  SPOCS: Spoc[]; LINES: Line[]; JOBS: Job[]; TECHNICIANS: Technician[]; PHOTOS: Photo[];
}
interface TimelineEvent { title: string; time: string; user: string; raw: number; }

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

/**
 * Work Order Details — the admin panel's order details drawer as customer-side users see it:
 * the order card, ticket details, SPOCs, technicians, contact buttons, status and Cancel Work
 * Order on the left; Verification, Work Order Details and Action/Activity Log on the right.
 * The tabs the panel disables for these users are shown disabled here too. Everything is read
 * through customerDashboard/*, which checks the order is in the caller's scope.
 */
@Component({
  selector: 'cp-work-order-details',
  standalone: true,
  imports: [
    NgIf, NgFor, NgClass, FormsModule, AngularEditorModule, NzButtonModule, NzEmptyModule, NzGridModule, NzIconModule, NzInputModule, NzModalModule,
    NzSelectModule, NzSpinModule, NzTabsModule, NzTagModule, NzTimelineModule, NzToolTipModule
  ],
  templateUrl: './work-order-details.component.html',
  styleUrls: ['./work-order-details.component.css']
})
export class WorkOrderDetailsComponent implements OnInit {
  readonly readable = minutesToReadable;
  orderId = 0;
  isSpinning = false;
  order: Order | null = null;

  timeline: { date: string; events: TimelineEvent[] }[] = [];
  logsLoading = false;
  private logsLoaded = false;

  cancelModalVisible = false;
  alreadyAcceptedModalVisible = false;
  cancelReasonList: { ID: number; REASON: string }[] = [];
  selectedCancelReason: string | null = null;
  cancelRemark = '';
  isCancelling = false;

  constructor(
    private api: ApiService,
    private data: DataService,
    private toast: ToastService,
    private router: Router,
    route: ActivatedRoute
  ) {
    this.orderId = Number(route.snapshot.paramMap.get('id')) || 0;
  }

  ngOnInit(): void { this.load(); }

  @HostListener('document:keydown.escape') close(): void {
    if (this.cancelModalVisible || this.alreadyAcceptedModalVisible) return;
    this.router.navigate(['/work-orders']);
  }

  load(): void {
    if (!this.orderId) { this.close(); return; }
    this.isSpinning = true;
    this.api.orderView(this.orderId).subscribe({
      next: (r: any) => {
        this.isSpinning = false;
        if (r?.code === 200 && r.data) {
          this.order = r.data;
          this.description = r.data.SPECIAL_INSTRUCTIONS && r.data.SPECIAL_INSTRUCTIONS !== 'null' ? r.data.SPECIAL_INSTRUCTIONS : '';
        } else {
          this.toast.error(r?.message || 'Work order not found.');
          this.router.navigate(['/work-orders']);
        }
      },
      error: err => {
        this.isSpinning = false;
        this.toast.error(err?.error?.message || 'Could not load the work order.');
        this.router.navigate(['/work-orders']);
      }
    });
  }

  // ---- Display helpers ---------------------------------------------------------------------
  get o(): Order { return this.order!; }
  dt(value: string | null | undefined): string { return value ? siteDateTime(value, this.o.IANA_CODE).full : '-'; }
  get status(): string { return this.o.ORDER_STATUS; }
  get refundOk(): boolean { return this.o.REFUND_STATUS == null || this.o.REFUND_STATUS === 'R'; }
  get isGuest(): boolean { return this.o.ORDER_TYPE === 'G'; }
  get job(): Job | undefined { return this.o.JOBS[0]; }
  get completed(): boolean { return this.status === 'CO' || this.o.TECHNICIAN_STATUS === 'CO'; }

  ticketTypeText(): string {
    const t = this.o.TICKET_TYPE;
    if (!t) return '-';
    if (t === 'FULL_DAY') return 'Full Day';
    if (t === 'HALF_DAY') return 'Half Day';
    if (t === 'HOURS') return 'Hours' + (this.o.TICKET_HOURS ? ` (${this.o.TICKET_HOURS} hrs)` : '');
    return t;
  }

  copy(text: string): void {
    try { navigator.clipboard.writeText(text); this.toast.show('Copied'); } catch { /* ignore */ }
  }

  get mapUrl(): string {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(this.o.SERVICE_ADDRESS || '');
  }

  edit(): void { this.router.navigate(['/raise-ticket'], { queryParams: { edit: this.orderId } }); }
  viewAttachment(): void { window.open(this.api.staticUrl('OrderAttachments', this.o.DOCUMENT_NAME), '_blank'); }

  // ---- Tabs ----------------------------------------------------------------------------------
  /** The panel disables Work Order Details for rejected, cancelled and cancel-pending accepted orders. */
  get detailsTabDisabled(): boolean {
    return ['OR', 'C', 'CA'].includes(this.status) || (this.status === 'OA' && this.o.REFUND_STATUS === 'P');
  }
  get travelTabDisabled(): boolean { return ['OP', 'OR', 'C', 'CA'].includes(this.status); }

  onTab(index: number): void {
    if (index === 3 && !this.logsLoaded) this.loadLogs();
    if (index === 7) setTimeout(() => this.drawMap());
  }

  // ---- Service Location (the panel's map: one marker with its info window) -----------------
  mapState: 'loading' | 'ready' | 'nodata' | 'error' = 'loading';
  get hasLocation(): boolean {
    const lat = parseFloat(this.o.SERVICE_LATITUDE), lng = parseFloat(this.o.SERVICE_LONGITUDE);
    return isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0);
  }
  private drawMap(): void {
    if (!this.hasLocation) { this.mapState = 'nodata'; return; }
    const el = document.getElementById('service-map');
    if (!el) return;
    this.mapState = 'loading';
    loadGoogleMaps().then(maps => {
      const o = this.o;
      const position = { lat: parseFloat(o.SERVICE_LATITUDE), lng: parseFloat(o.SERVICE_LONGITUDE) };
      const map = new maps.Map(el, { center: position, zoom: 14 });
      const marker = new maps.Marker({ position, map });
      // Built as DOM nodes so names and addresses are never parsed as HTML.
      const box = document.createElement('div');
      box.className = 'map-info-window1';
      const add = (tag: string, text: string) => { const n = document.createElement(tag); n.textContent = text; box.appendChild(n); };
      add('h6', o.CUSTOMER_NAME || '');
      add('p', [o.ADDRESS_LINE_1, o.ADDRESS_LINE_2].filter(Boolean).join(', ')
        + (o.CITY_NAME ? ', ' + o.CITY_NAME : '') + (o.STATE_NAME ? ', ' + o.STATE_NAME : '')
        + (o.PINCODE ? ' - ' + o.PINCODE : '') + (o.COUNTRY_NAME ? ', ' + o.COUNTRY_NAME : ''));
      add('p', o.SERVICE_LATITUDE + ',' + o.SERVICE_LONGITUDE);
      const info = new maps.InfoWindow({ content: box });
      info.open(map, marker);
      marker.addListener('mouseover', () => info.open(map, marker));
      marker.addListener('mouseout', () => info.close());
      this.mapState = 'ready';
    }).catch(() => (this.mapState = 'error'));
  }

  /** Job card list in Verification: shown once the order is accepted and not cancelled. */
  get showJobCards(): boolean {
    return !['OP', 'OR', 'C', 'CA'].includes(this.status) && this.refundOk
      && (!this.isGuest || (this.o.LINES[0] && !this.o.LINES[0].JOB_CARD_ID));
  }
  get showGuestTech(): boolean { return !['OP', 'OR', 'C', 'CA'].includes(this.status) && this.isGuest && this.refundOk; }

  // ---- Work Order Details tab ----------------------------------------------------------------
  get reportFilled(): boolean {
    const j = this.job;
    return !!j && ((j.SITE_VISIT_REPORT_TYPE === 'Dispatch' && !!j.IS_DISPATCH_REPORT_FILLED)
      || (j.SITE_VISIT_REPORT_TYPE === 'QHC' && !!j.IS_QHC_REPORT_FILLED));
  }
  get showCompletion(): boolean {
    return this.completed && !!this.job && (this.reportFilled || !!this.job.REMARK || this.o.PHOTOS.length > 0);
  }
  openReport(): void {
    const j = this.job;
    if (!j) return;
    if (j.SITE_VISIT_REPORT_TYPE === 'Dispatch') window.open(this.api.staticUrl('DispatchReport', j.DISPATCH_REPORT_URL), '_blank');
    else if (j.SITE_VISIT_REPORT_TYPE === 'QHC') window.open(this.api.staticUrl('QhcReport', j.QHC_REPORT_URL), '_blank');
  }
  photoUrl(p: Photo): string { return this.api.staticUrl('JobPhotos', p.PHOTOS_URL); }
  isImage(p: Photo): boolean { return IMAGE.test(p.PHOTOS_URL || ''); }
  fileLabel(p: Photo): string { return ((/\.([a-z0-9]+)$/i.exec(p.PHOTOS_URL || '') || [])[1] || 'FILE').toUpperCase(); }

  /** The details the customer entered, as plain text (they are stored as rich text). */
  get detailsText(): string {
    const html = this.o.SPECIAL_INSTRUCTIONS;
    if (!html || html === 'null') return '';
    return (new DOMParser().parseFromString(String(html), 'text/html').body.textContent || '').trim();
  }

  // ---- Editing the work order details (the panel's editor in this tab) ---------------------
  description = '';
  savingDescription = false;
  readonly editorConfig: AngularEditorConfig = {
    height: '50vh',
    showToolbar: true,
    editable: true,
    spellcheck: true,
    minHeight: '50vh',
    maxHeight: '60vh',
    placeholder: 'Enter work order details here...',
    toolbarHiddenButtons: [['insertImage', 'insertVideo']],
    defaultParagraphSeparator: 'p'
  };
  /** The editor shows until the work is completed; the button while the order is still open. */
  get showEditor(): boolean { return this.o.TECHNICIAN_STATUS !== 'CO' && this.status !== 'CO'; }
  get canUpdateDescription(): boolean {
    return !['OC', 'CO', 'OR', 'C', 'CA'].includes(this.status) && this.o.TECHNICIAN_STATUS !== 'CO'
      && (this.o.REFUND_STATUS == null || ['P', 'R'].includes(this.o.REFUND_STATUS));
  }
  updateDescription(): void {
    const plain = (new DOMParser().parseFromString(this.description || '', 'text/html').body.textContent || '').trim();
    if (!plain) return this.toast.error('Please enter work order details');
    if ((this.description || '').length > 50000) return this.toast.error('Work order details can be at most 50000 characters.');
    this.savingDescription = true;
    this.api.updateDescription(this.orderId, this.description).subscribe({
      next: (r: any) => {
        this.savingDescription = false;
        if (Number(r?.code) === 200) {
          this.toast.show('Work order details updated successfully');
          this.o.SPECIAL_INSTRUCTIONS = this.description;
          this.logsLoaded = false;
        } else {
          this.toast.error(r?.message || 'Failed to update work order details.');
        }
      },
      error: err => { this.savingDescription = false; this.toast.error(err?.error?.message || 'Failed to update work order details.'); }
    });
  }

  // ---- Action/Activity Log -------------------------------------------------------------------
  private loadLogs(): void {
    this.logsLoading = true;
    this.api.activityLog(this.orderId).subscribe({
      next: (r: any) => {
        this.logsLoading = false;
        this.logsLoaded = true;
        this.timeline = r?.code === 200 ? this.group(r.data || []) : [];
      },
      error: () => { this.logsLoading = false; this.timeline = []; }
    });
  }

  /** As the panel: one group per day in the log's own time zone, newest first. */
  private group(days: any[]): { date: string; events: TimelineEvent[] }[] {
    const grouped: Record<string, TimelineEvent[]> = {};
    days.forEach(day => (day.ACTION_LOGS || []).forEach((log: any) => {
      const iana = log.IANA_CODE || 'Asia/Kolkata';
      const when = new Date(log.DATE_TIME);
      let date = '', time = '';
      try {
        date = new Intl.DateTimeFormat('en-GB', { timeZone: iana, day: '2-digit', month: '2-digit', year: 'numeric' }).format(when);
        time = new Intl.DateTimeFormat('en-US', {
          timeZone: iana, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true
        }).format(when);
      } catch {
        date = when.toLocaleDateString('en-GB');
        time = when.toLocaleString();
      }
      (grouped[date] = grouped[date] || []).push({
        title: log.ACTION_DETAILS || 'Action performed',
        time,
        user: log.ACTION_LOG_TYPE === 'Technician' ? log.TECHNICIAN_NAME : log.USER_NAME,
        raw: when.getTime()
      });
    }));
    const key = (d: string) => d.split('/').reverse().join('');
    return Object.keys(grouped)
      .sort((a, b) => key(b).localeCompare(key(a)))
      .map(date => ({ date, events: grouped[date].sort((a, b) => b.raw - a.raw) }));
  }

  // ---- Cancel Work Order -----------------------------------------------------------------------
  /** As the panel for customer-side users: until a cancellation is pending, while OP/OA/ON/OS. */
  get canCancel(): boolean {
    return this.o.REFUND_STATUS !== 'P' && ['OP', 'OA', 'ON', 'OS'].includes(this.status);
  }

  openCancelWorkOrderModal(): void {
    if (this.status !== 'OP') { this.alreadyAcceptedModalVisible = true; return; }
    this.selectedCancelReason = null;
    this.cancelRemark = '';
    this.cancelModalVisible = true;
    if (!this.cancelReasonList.length) {
      this.api.cancelReasons().subscribe({
        next: (r: any) => (this.cancelReasonList = r?.code === 200 ? r.data || [] : []),
        error: () => (this.cancelReasonList = [])
      });
    }
  }

  submitCancelWorkOrder(): void {
    if (!this.selectedCancelReason) return this.toast.error('Please select a cancellation reason');
    this.isCancelling = true;
    this.api.cancelTicket(this.orderId, this.selectedCancelReason, this.cancelRemark.trim()).subscribe({
      next: (r: any) => {
        this.isCancelling = false;
        if (Number(r?.code) === 200) {
          this.toast.show('Work Order cancelled successfully');
          this.cancelModalVisible = false;
          this.data.reload();
          this.load();
        } else if (Number(r?.code) === 302) {
          this.toast.error("Please provide the work order's timezone to proceed");
        } else {
          this.toast.error(r?.message || 'Failed to cancel the work order.');
        }
      },
      error: err => { this.isCancelling = false; this.toast.error(err?.error?.message || 'Failed to cancel the work order.'); }
    });
  }
}
