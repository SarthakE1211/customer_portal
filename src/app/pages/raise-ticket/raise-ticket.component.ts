import { Component, HostListener, OnInit } from '@angular/core';
import { NgClass, NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTimePickerModule } from 'ng-zorro-antd/time-picker';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { ApiService } from '../../core/api.service';
import { CustomerOption, DataService } from '../../core/data.service';
import { isoDate, siteDateTime } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { MapSpocComponent } from './map-spoc.component';

interface Address {
  ID: number; CUSTOMER_ID: number; CUSTOMER_NAME: string; ADDRESS_LINE_1: string; ADDRESS_LINE_2: string;
  LANDMARK: string; CITY_NAME: string; STATE_NAME: string; COUNTRY_NAME: string; PINCODE: string; SITE_NUMBER: string;
  TYPE: string; IS_DEFAULT: number; SPOC_COUNT: number; IANA_CODE: string;
}
interface PriorityOption { ID: number; PRIORITY_NAME: string; RESPONSE_TIME: number; IS_CUSTOME_PRIORITY: number; DAYS_FOR_SLA_CALCULATION: number | null; }
interface ServiceOption {
  ID: number; NAME: string; WORK: string; CATEGORY_ID: number; CATEGORY: string;
  DESCRIPTION?: string; IS_JOB_CREATED_DIRECTLY?: number; UNIT_NAME?: string;
}
interface TechLevel { ID: number; NAME: string; }
interface Spoc { ID: number; FULL_NAME: string; EMAIL_ID: string; MOBILE_NUMBER: string; COUNTRY_CODE: string; IS_PRIMARY: number; }

/** Today's date and the time now at a site, from its IANA zone. */
function zoneNow(iana: string): { date: string; hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: iana, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (t: string) => parts.find(p => p.type === t)?.value || '0';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24, minute: Number(get('minute')) };
  } catch {
    const d = new Date();
    return { date: isoDate(d), hour: d.getHours(), minute: d.getMinutes() };
  }
}

/** A UTC instant as the date and the time of day at a site, for the date and time pickers. */
function zoneParts(utc: string, iana: string): { date: Date; time: Date } | null {
  const when = new Date(utc);
  if (isNaN(when.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: iana, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(when);
    const n = (k: string) => Number(parts.find(p => p.type === k)?.value || 0);
    const date = new Date(n('year'), n('month') - 1, n('day'));
    const time = new Date(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'));
    return { date, time };
  } catch {
    return null;
  }
}

/** Text of a rich-text (HTML) value, without its markup; parsed inertly, nothing runs. */
function plainText(html: string | null | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Minutes as the admin panel's minutesToReadable pipe shows them: "2 Hrs 30 Mins". */
export function minutesToReadable(minutes: number | null | undefined): string {
  if (minutes == null) return '';
  const hrs = Math.floor(minutes / 60), mins = minutes % 60;
  let result = hrs > 0 ? `${hrs} Hr${hrs > 1 ? 's' : ''}` : '';
  if (mins > 0) result += (result ? ' ' : '') + `${mins} Min${mins > 1 ? 's' : ''}`;
  return result || '0 Min';
}

/**
 * Raise a ticket — the admin panel's form (ordercreatedrawer) as customer-side users see it:
 * the same ng-zorro fields, dropdowns and pickers. Source is fixed to System Generated, Ticket
 * Type and Tech Level are required, and Acknowledged SLA Met? is not shown. Everything goes
 * through customerDashboard/*, which checks the customer, site and SPOCs against the caller's
 * scope on the server.
 */
@Component({
  selector: 'cp-raise-ticket',
  standalone: true,
  imports: [
    NgIf, NgFor, NgClass, NgTemplateOutlet, FormsModule, NzButtonModule, NzDatePickerModule, NzDrawerModule, NzFormModule, NzGridModule,
    NzIconModule, NzInputModule, NzInputNumberModule, NzPopconfirmModule, NzRadioModule, NzSelectModule, NzSpinModule, NzTagModule,
    NzTimePickerModule, NzToolTipModule, MapSpocComponent
  ],
  templateUrl: './raise-ticket.component.html',
  styleUrls: ['./raise-ticket.component.css']
})
export class RaiseTicketComponent implements OnInit {
  readonly SYSTEM_GENERATED_SOURCE = 'System Generated';
  readonly ticketTypes = [
    { value: 'FULL_DAY', label: 'Full Day' },
    { value: 'HALF_DAY', label: 'Half Day' },
    { value: 'HOURS', label: 'Hours' }
  ];
  readonly minuteStep = 10;
  readonly readable = minutesToReadable;

  isDuplicate = false;
  /** Edit of a created, not yet accepted order (the panel's Edit). */
  editId = 0;
  orderNumber = '';
  /** The order card shown in place of the customer fields when editing. */
  editCard: { ORDER_NUMBER: string; ORDER_DATE: string; CUSTOMER_NAME: string; EMAIL: string; MOBILE_NO: string; SERVICE_ADDRESS: string } | null = null;
  isSpinning = false;
  customers: CustomerOption[] = [];
  organizationName: string | null = null;
  customerId: number | null = null;

  optionsLoading = false;
  addresses: Address[] = [];
  priorities: PriorityOption[] = [];
  services: ServiceOption[] = [];
  techLevels: TechLevel[] = [];
  isTechLevelLoading = false;

  addressId: number | null = null;
  source = this.SYSTEM_GENERATED_SOURCE;
  clientRef = '';
  ticketType: string | null = null;
  ticketHours: number | null = null;
  showTicketHoursError = false;
  techLevelId: number | null = null;

  spocList: Spoc[] = [];
  selectedSpocs: Spoc[] = [];
  selectedSpoc: number | null = null;
  isSpocLoading = false;

  category: string | null = null;
  work: string | null = null;
  serviceId: number | null = null;
  /** The service put on the work order with Select (the panel's cart holds one). */
  cartService: ServiceOption | null = null;
  /** The cart service's description as plain text (it is stored as rich text). */
  cartDescription = '';

  priorityId: number | null = null;
  slaTime: number | null = null;
  expectedDate: Date | null = null;
  time: Date | null = null;
  details = '';

  attachmentName: string | null = null;
  uploading = false;
  submitting = false;

  // New SPOC: Map SPOC(s) drawer
  spocDrawer = false;

  constructor(
    private api: ApiService,
    private data: DataService,
    private toast: ToastService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.isTechLevelLoading = true;
    this.api.techLevels().subscribe({
      next: (r: any) => { this.isTechLevelLoading = false; this.techLevels = r?.code === 200 ? r.data || [] : []; },
      error: () => { this.isTechLevelLoading = false; this.techLevels = []; }
    });

    const duplicateId = Number(this.route.snapshot.queryParamMap.get('duplicate')) || 0;
    this.editId = duplicateId ? 0 : Number(this.route.snapshot.queryParamMap.get('edit')) || 0;
    this.isDuplicate = !!duplicateId;
    this.data.customers().subscribe(list => {
      this.customers = list;
      if (duplicateId || this.editId) return this.loadTemplate(duplicateId || this.editId);
      const picked = this.data.selectedCustomer$.value;
      const start = picked && list.some(c => c.ID === picked) ? picked : list.length === 1 ? list[0].ID : null;
      if (start) this.selectCustomer(start);
    });
  }

  @HostListener('document:keydown.escape') close(): void {
    if (this.spocDrawer) return;
    this.router.navigate(['/work-orders']);
  }

  // ---- Organization -> Customer (as the panel: an organization is a company name) ----------
  private orgOf(c: CustomerOption): string { return (c.COMPANY_NAME || '').trim() || c.NAME; }
  get organizations(): string[] {
    return Array.from(new Set(this.customers.map(c => this.orgOf(c)).filter(Boolean)));
  }
  /** Customers of the picked organization; everything until one is picked. */
  get customerOptions(): CustomerOption[] {
    if (!this.organizationName) return this.customers;
    return this.customers.filter(c => this.orgOf(c) === this.organizationName);
  }
  customerLabel(c: CustomerOption): string { return c.CONTACT_NAME || c.NAME; }

  /** nz-select search over name, company, phone and email, like the panel's server search. */
  readonly customerFilter = (input: string, option: any): boolean => {
    const c = this.customers.find(x => x.ID === option.nzValue);
    const term = input.toLowerCase();
    return !!c && [c.CONTACT_NAME, c.NAME, c.COMPANY_NAME, c.MOBILE_NO, c.EMAIL].some(v => (v || '').toLowerCase().includes(term));
  };
  readonly addressFilter = (input: string, option: any): boolean => {
    const a = this.addresses.find(x => x.ID === option.nzValue);
    const term = input.toLowerCase();
    return !!a && [a.ADDRESS_LINE_1, a.ADDRESS_LINE_2, a.LANDMARK, a.CITY_NAME, a.STATE_NAME, a.PINCODE, a.SITE_NUMBER]
      .some(v => String(v || '').toLowerCase().includes(term));
  };

  selectOrgName(name: string | null): void {
    this.organizationName = name || null;
    if (!this.organizationName) return;
    const options = this.customerOptions;
    // An organization without child accounts is itself the customer.
    if (options.length === 1 && this.customerId !== options[0].ID) this.selectCustomer(options[0].ID);
    else if (this.customerId && !options.some(c => c.ID === this.customerId)) this.selectCustomer(null);
  }

  selectCustomer(id: number | null, then?: () => void): void {
    this.customerId = id;
    const c = this.customers.find(x => x.ID === id);
    if (c) this.organizationName = this.orgOf(c);
    this.addresses = [];
    this.priorities = [];
    this.services = [];
    this.category = this.work = null;
    this.serviceId = this.priorityId = this.slaTime = null;
    this.addToTable(null);
    this.onAddress(null);
    if (!id) return;
    this.optionsLoading = true;
    this.api.ticketOptions(id).subscribe({
      next: (r: any) => {
        this.optionsLoading = false;
        if (r?.code !== 200) { this.toast.error(r?.message || 'Could not load sites and services'); return; }
        this.addresses = r.addresses || [];
        this.priorities = r.priorities || [];
        this.services = r.services || [];
        // The panel opens on the first Type of Visit, so the order always has one.
        if (this.visitTypes.length) this.category = this.visitTypes[0];
        if (then) then();
        else {
          const def = this.addresses.find(a => a.IS_DEFAULT) || (this.addresses.length === 1 ? this.addresses[0] : undefined);
          if (def) this.onAddress(def.ID);
        }
      },
      error: err => { this.optionsLoading = false; this.toast.error(err?.error?.message || 'Could not load sites and services'); }
    });
  }

  private loadTemplate(orderId: number): void {
    this.isSpinning = true;
    this.api.orderTemplate(orderId).subscribe({
      next: (r: any) => {
        this.isSpinning = false;
        const t = r?.code === 200 ? r.data : null;
        if (!t) { this.toast.error(r?.message || 'Could not load the work order'); return; }
        if (this.editId && !t.CAN_EDIT) {
          this.toast.error('Work order cannot be updated as it is already processed.');
          this.router.navigate(['/work-orders']);
          return;
        }
        this.orderNumber = t.ORDER_NUMBER || '';
        if (this.editId) {
          this.attachmentName = t.DOCUMENT_NAME || null;
          this.editCard = {
            ORDER_NUMBER: t.ORDER_NUMBER || '',
            ORDER_DATE: t.ORDER_DATE_TIME ? siteDateTime(t.ORDER_DATE_TIME, t.IANA_CODE).full : '',
            CUSTOMER_NAME: t.CUSTOMER_NAME || '',
            EMAIL: t.EMAIL || '',
            MOBILE_NO: t.MOBILE_NO || '',
            SERVICE_ADDRESS: t.SERVICE_ADDRESS || ''
          };
        }
        this.clientRef = t.CLIENT_SOURCE_TICKET_NUMBER || '';
        this.details = t.DESCRIPTION || '';
        this.ticketType = t.TICKET_TYPE || null;
        this.ticketHours = t.TICKET_HOURS || null;
        this.techLevelId = t.TECH_LEVEL_ID || null;
        this.selectCustomer(t.CUSTOMER_ID, () => {
          if (this.addresses.some(a => a.ID === t.ADDRESS_ID)) this.onAddress(t.ADDRESS_ID, this.editId ? t.SPOC_IDS || [] : []);
          // Editing keeps the order's preferred start, shown in the site's time zone.
          if (this.editId && t.PREFERED_START_TIME) {
            const at = zoneParts(t.PREFERED_START_TIME, t.IANA_CODE || this.selectedAddress?.IANA_CODE || 'UTC');
            if (at) { this.expectedDate = at.date; this.time = at.time; }
          }
          if (this.priorities.some(p => p.ID === t.PRIORITY_MAPPING_ID)) this.onPriorityChange(t.PRIORITY_MAPPING_ID);
          const s = this.services.find(x => x.ID === t.SERVICE_ID);
          if (s) { this.category = s.CATEGORY; this.work = s.WORK; this.serviceId = s.ID; this.addToTable(s); }
        });
      },
      error: () => { this.isSpinning = false; this.toast.error('Could not load the work order'); }
    });
  }

  // ---- Site and SPOCs ----------------------------------------------------------------------
  addressLabel(a: Address): string {
    return a.ADDRESS_LINE_1 + ', ' + (a.ADDRESS_LINE_2 || '') + '-' + (a.PINCODE || '') + ', ' + (a.LANDMARK || '');
  }
  get selectedAddress(): Address | undefined { return this.addresses.find(a => a.ID === this.addressId); }

  onAddress(id: number | null, keepSpocs: number[] = []): void {
    this.addressId = id;
    this.spocList = [];
    this.selectedSpocs = [];
    this.selectedSpoc = null;
    this.expectedDate = this.time = null;
    if (id && this.customerId) this.loadSpocs(keepSpocs);
  }

  /** Loads the site's SPOCs; the primary is always on the order, as in the panel. */
  private loadSpocs(keep: number[] = []): void {
    const addressId = this.addressId;
    this.isSpocLoading = true;
    this.api.siteSpocs(this.customerId!, addressId!).subscribe({
      next: (r: any) => {
        if (addressId !== this.addressId) return;
        this.isSpocLoading = false;
        this.applySpocs(r?.code === 200 ? r.data || [] : [], keep);
      },
      error: () => { this.isSpocLoading = false; this.spocList = []; }
    });
  }

  private applySpocs(list: Spoc[], keep: number[]): void {
    this.spocList = list;
    const ids = new Set(this.selectedSpocs.map(p => p.ID).concat(keep));
    this.selectedSpocs = list.filter(p => p.IS_PRIMARY === 1 || ids.has(p.ID));
  }

  onSpocSelect(id: number | null): void {
    if (!id) return;
    const poc = this.spocList.find(p => p.ID === id);
    if (poc && !this.selectedSpocs.some(p => p.ID === id)) this.selectedSpocs = [...this.selectedSpocs, poc];
    // Clear the box after the select has finished writing the value.
    setTimeout(() => (this.selectedSpoc = null));
  }
  removeSpoc(id: number): void { this.selectedSpocs = this.selectedSpocs.filter(p => p.ID !== id); }

  // ---- New SPOC (Map SPOC(s)) ---------------------------------------------------------------
  addressspocMappingSPOC(): void {
    if (!this.customerId || !this.addressId) return this.toast.error('Please select service address');
    this.spocDrawer = true;
  }
  /** As the panel: on close the site's SPOCs are read again and the primary is re-picked. */
  closeSpocDrawer(): void {
    this.spocDrawer = false;
    this.spocList = [];
    this.selectedSpocs = [];
    this.selectedSpoc = null;
    if (this.addressId && this.customerId) this.loadSpocs();
  }

  // ---- Ticket type -------------------------------------------------------------------------
  onTicketTypeChange(type: string | null): void {
    // Number of Hours only exists on an hourly ticket.
    if (type !== 'HOURS') this.ticketHours = null;
    this.showTicketHoursError = false;
  }
  isTicketHoursValid(): boolean {
    const h = Number(this.ticketHours);
    return this.ticketHours !== null && h >= 0.5 && h <= 24 && Math.round(h * 2) === h * 2;
  }

  // ---- Catalogue: Type of Visit -> Type of Work -> Service ---------------------------------
  get visitTypes(): string[] { return Array.from(new Set(this.services.map(s => s.CATEGORY))); }
  get works(): string[] { return Array.from(new Set(this.services.filter(s => s.CATEGORY === this.category).map(s => s.WORK))); }
  get catalogue(): ServiceOption[] { return this.services.filter(s => s.CATEGORY === this.category && s.WORK === this.work); }
  onVisitChange(c: string): void {
    if (c === this.category) return;
    this.category = c;
    this.work = null;
    this.serviceId = null;
  }
  onWorkChange(w: string): void {
    this.work = w;
    this.serviceId = this.catalogue.length === 1 ? this.catalogue[0].ID : null;
  }
  get selectedService(): ServiceOption | undefined { return this.services.find(s => s.ID === this.serviceId); }
  addToTable(s: ServiceOption | null): void {
    this.cartService = s;
    this.cartDescription = s ? plainText(s.DESCRIPTION) : '';
  }
  deleteService(): void { this.addToTable(null); }

  // ---- Priority, SLA time, preferred start ----------------------------------------------------
  get prioritydata(): PriorityOption | undefined { return this.priorities.find(p => p.ID === this.priorityId); }
  onPriorityChange(id: number | null): void {
    this.priorityId = id;
    const p = this.prioritydata;
    this.slaTime = p ? p.RESPONSE_TIME : null;
  }
  businessDays(p: PriorityOption): string {
    const d = Number(p.DAYS_FOR_SLA_CALCULATION);
    if (p.DAYS_FOR_SLA_CALCULATION === null || p.DAYS_FOR_SLA_CALCULATION === undefined) return '';
    return d === 0 ? 'Same Business Day' : d === 1 ? 'Next Business Day' : d + ' Business Days';
  }

  private get siteNow() { return zoneNow(this.selectedAddress?.IANA_CODE || 'UTC'); }
  private get pickedIsToday(): boolean { return !!this.expectedDate && isoDate(this.expectedDate) === this.siteNow.date; }

  /** Days before today at the site cannot be picked. */
  disabledDate = (current: Date): boolean => !!current && isoDate(current) < this.siteNow.date;
  getDisabledHours = (): number[] => {
    if (!this.pickedIsToday) return [];
    const now = this.siteNow.hour;
    return Array.from({ length: now }, (_, h) => h);
  };
  getDisabledMinutes = (hour: number): number[] => {
    if (!this.pickedIsToday) return [];
    const now = this.siteNow;
    if (hour !== now.hour) return [];
    return Array.from({ length: now.minute + 1 }, (_, m) => m);
  };
  setDate(value: Date | null): void {
    this.expectedDate = value;
    this.time = null;
  }
  setTime(value: Date | null): void {
    if (!value) return;
    const step = this.minuteStep;
    const minutes = Math.round(value.getMinutes() / step) * step;
    value.setMinutes(minutes, 0, 0);
    if (this.getDisabledHours().includes(value.getHours()) || this.getDisabledMinutes(value.getHours()).includes(value.getMinutes())) {
      this.toast.error('You can not schedule order at ' + value.getHours() + ':' + String(value.getMinutes()).padStart(2, '0'));
      setTimeout(() => (this.time = null));
    }
  }

  // ---- Attachment ----------------------------------------------------------------------------
  onFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.toast.error('Attachment size must be less than 2MB.'); return; }
    const ext = (file.name.split('.').pop() || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'bin';
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const name = stamp + Math.floor(100000 + Math.random() * 900000) + '.' + ext;
    this.uploading = true;
    this.api.uploadAttachment(file, name).subscribe({
      next: (r: any) => {
        this.uploading = false;
        if (r?.code === 200) {
          this.attachmentName = name;
          this.toast.show('Attachment uploaded');
        } else {
          this.toast.error(r?.message || 'Failed to upload attachment.');
        }
      },
      error: () => { this.uploading = false; this.toast.error('Failed to upload attachment.'); }
    });
  }
  deletedoc(): void { this.attachmentName = null; }

  // ---- Submit --------------------------------------------------------------------------------
  submit(): void {
    if (this.ticketType === 'HOURS') this.showTicketHoursError = true;
    const checks: [boolean, string][] = [
      [!this.customerId, 'Please select customer name'],
      [!this.addressId, 'Please select service address'],
      [!this.ticketType, 'Please select ticket type'],
      [this.ticketType === 'HOURS' && !this.isTicketHoursValid(), 'Please enter number of hours between 0.5 and 24, in half-hour steps'],
      [!this.selectedSpocs.length, 'Please select SPOC'],
      [!this.techLevelId, 'Please select tech level'],
      [!this.cartService, 'Please select service'],
      [!this.priorityId, 'Please select priority'],
      [!this.expectedDate, 'Please select preferred start date'],
      [!this.time, 'Please select preferred start time']
    ];
    const failed = checks.find(c => c[0]);
    if (failed) { this.toast.error(failed[1]); return; }

    const s = this.cartService!;
    const t = this.time!;
    const visitTime = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    if (this.editId) return this.update(visitTime);
    this.submitting = true;
    this.api.createTicket({
      CUSTOMER_ID: this.customerId,
      ADDRESS_ID: this.addressId,
      SERVICE_ID: s.ID,
      PRIORITY_MAPPING_ID: this.priorityId,
      VISIT_DATE: isoDate(this.expectedDate!),
      VISIT_TIME: String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'),
      DESCRIPTION: this.details.trim(),
      CLIENT_TICKET_NO: this.clientRef.trim(),
      SPOC_IDS: this.selectedSpocs.map(p => p.ID),
      TYPE_OF_VISIT: s.CATEGORY,
      TYPE_OF_WORK: s.WORK,
      TYPE_OF_ACTIVITY: s.NAME,
      TICKET_TYPE: this.ticketType,
      TICKET_HOURS: this.ticketType === 'HOURS' ? Number(this.ticketHours) : null,
      TECH_LEVEL_ID: this.techLevelId,
      DOCUMENT_NAME: this.attachmentName
    }).subscribe({
      next: (r: any) => {
        this.submitting = false;
        if (r?.code === 200) {
          const no = r.orderDetails?.ORDER_NUMBER || r.data?.ORDER_NUMBER || r.ORDER_NUMBER || '';
          this.toast.show(no ? 'Ticket raised Successfully — ' + no : 'Ticket raised Successfully');
          this.data.reload();
          this.router.navigate(['/work-orders']);
        } else {
          this.toast.error(r?.message || 'Could not raise the ticket.');
        }
      },
      error: err => { this.submitting = false; this.toast.error(err?.error?.message || 'Could not raise the ticket.'); }
    });
  }

  /** Saves the edit through customerDashboard/updateTicket (customer and site stay; the service may change). */
  private update(visitTime: string): void {
    this.submitting = true;
    this.api.updateTicket({
      ORDER_ID: this.editId,
      SERVICE_ID: this.cartService!.ID,
      PRIORITY_MAPPING_ID: this.priorityId,
      VISIT_DATE: isoDate(this.expectedDate!),
      VISIT_TIME: visitTime,
      DESCRIPTION: this.details.trim(),
      SPOC_IDS: this.selectedSpocs.map(p => p.ID),
      TICKET_TYPE: this.ticketType,
      TICKET_HOURS: this.ticketType === 'HOURS' ? Number(this.ticketHours) : null,
      TECH_LEVEL_ID: this.techLevelId,
      DOCUMENT_NAME: this.attachmentName
    }).subscribe({
      next: (r: any) => {
        this.submitting = false;
        if (Number(r?.code) === 200) {
          this.toast.show('Work Order Updated Successfully');
          this.data.reload();
          this.router.navigate(['/work-orders']);
        } else {
          this.toast.error(r?.message || 'Work Order Updation Failed');
        }
      },
      error: err => { this.submitting = false; this.toast.error(err?.error?.message || 'Something Went Wrong.'); }
    });
  }
}
