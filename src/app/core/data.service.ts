import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, finalize, map, shareReplay, switchMap, Subject } from 'rxjs';
import { ApiService } from './api.service';
import { STATE_CODES, monthKey, titleCase } from './format';
import { Priority, RemoteArea, STAGE_BY_STATUS, Ticket } from './models';
import { SessionService } from './session.service';

export interface CustomerOption {
  ID: number;
  /** Account name (company, else the contact). */
  NAME: string;
  PARENT_CUSTOMER_ID: number | null;
  CONTACT_NAME?: string;
  COMPANY_NAME?: string;
  CUSTOMER_TYPE?: string;
  SALUTATION?: string;
  MOBILE_NO?: string;
  EMAIL?: string;
}

export interface PortalData {
  customerName: string;
  tickets: Ticket[];
  remoteAreas: RemoteArea[];
}

/**
 * Loads the signed-in viewer's work orders once (customerDashboard/get) and shares them with
 * the dashboard, work orders and reports pages. Staff users can narrow it to one of the
 * customers they are mapped to; customer accounts always get their own account plus children.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  /** Customer picked in the header (staff only). null = every customer in scope. */
  readonly selectedCustomer$ = new BehaviorSubject<number | null>(null);
  loading = false;

  private cache$: Observable<PortalData> | null = null;
  private customers$: Observable<CustomerOption[]> | null = null;
  /** The header's Customise button; the dashboard opens its Customise panel on it. */
  readonly customise$ = new Subject<void>();

  constructor(private api: ApiService, private session: SessionService) {}

  get isStaff(): boolean { return this.session.session?.kind === 'staff'; }

  data(): Observable<PortalData> {
    if (!this.cache$) {
      this.loading = true;
      const customerId = this.isStaff ? this.selectedCustomer$.value || undefined : undefined;
      this.cache$ = this.api.dashboard(customerId).pipe(
        map((res: any) => {
          if (!res || res.code !== 200) throw new Error(res?.message || 'Could not load work orders.');
          return {
            customerName: res.customer?.NAME || '',
            tickets: (res.data || []).map((r: any) => toTicket(r)),
            remoteAreas: (res.remoteAreas || []).map((a: any) => ({
              city: titleCase(a.CITY_NAME || ''),
              state: a.STATE_NAME || '',
              pin: String(a.PINCODE || '').trim().slice(0, 5),
              nearest: a.NEAREST_CITY || ''
            }))
          } as PortalData;
        }),
        finalize(() => (this.loading = false)),
        shareReplay(1)
      );
    }
    return this.cache$;
  }

  /** Drop the cache (after raising a ticket, switching customer, signing out). */
  reload(): void { this.cache$ = null; }

  selectCustomer(id: number | null): void {
    this.reload();
    this.selectedCustomer$.next(id);
  }

  /** Data for the current customer selection; emits again whenever a staff user switches customer. */
  watch(): Observable<PortalData> {
    return this.selectedCustomer$.pipe(switchMap(() => this.data()));
  }

  customers(): Observable<CustomerOption[]> {
    if (!this.customers$) {
      this.customers$ = this.api.customers().pipe(
        map((res: any) => (res?.code === 200 ? res.data : []) as CustomerOption[]),
        shareReplay(1)
      );
    }
    return this.customers$;
  }

  clear(): void {
    this.cache$ = null;
    this.customers$ = null;
    this.selectedCustomer$.next(null);
  }
}

const LEVELS: Priority[] = ['P1', 'P2', 'P3', 'P4'];

function toTicket(r: any): Ticket {
  const created = new Date(r.ORDER_DATE_TIME);
  const visit = new Date(r.VISIT_DATE_TIME || r.ORDER_DATE_TIME);
  const stateName = String(r.STATE || 'Unknown');
  const city = r.CITY && !/^unknown$/i.test(r.CITY) ? titleCase(r.CITY) : '(Not captured)';
  const technician = r.TECHNICIAN && r.TECHNICIAN !== 'Unassigned' ? String(r.TECHNICIAN) : '';
  return {
    dbId: Number(r.ID),
    id: String(r.TICKET_NO || r.ID),
    clientTicket: r.CLIENT_TICKET_NO || '',
    jobCard: r.JOB_CARD_NO || '',
    customerId: Number(r.CUSTOMER_ID),
    customer: r.SUB_CUSTOMER || '',
    created,
    visit: isNaN(visit.getTime()) ? created : visit,
    monthKey: monthKey(created),
    stage: STAGE_BY_STATUS[Number(r.STATUS_ID)] || 'created',
    statusName: r.STATUS_NAME || '',
    priorityName: r.PRIORITY || 'Unassigned',
    pr: LEVELS.includes(r.PRIORITY_LEVEL) ? r.PRIORITY_LEVEL : 'P4',
    city,
    state: titleCase(stateName),
    stateCode: STATE_CODES[stateName.toUpperCase()] || titleCase(stateName),
    region: r.REGION || 'Other',
    pin: String(r.PINCODE || '').trim().slice(0, 5),
    service: r.SERVICE || 'Unassigned',
    technician: technician || 'Not assigned yet',
    hasTechnician: !!technician,
    source: r.SOURCE || 'Other',
    // Orders raised before the Type of Visit step have none; they count as dispatch.
    visitType: r.VISIT_TYPE || 'Dispatch',
    visitTypeGuessed: !r.VISIT_TYPE,
    hours: r.VISIT_HOURS === null || r.VISIT_HOURS === undefined ? null : Number(r.VISIT_HOURS),
    age: Number(r.AGE_DAYS) || 0,
    billed: Number(r.BILLED) || 0,
    slaMet: r.SLA_MET !== false,
    slaReason: r.SLA_REASON || '',
    ticketType: r.TICKET_TYPE || null
  };
}

export const EMPTY_DATA: PortalData = { customerName: '', tickets: [], remoteAreas: [] };
