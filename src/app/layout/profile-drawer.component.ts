import { Component, EventEmitter, HostListener, OnInit, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';
import { SessionService } from '../core/session.service';
import { ToastService } from '../core/toast.service';

type Panel = 'profile' | 'settings' | 'addresses' | 'help';

interface Settings {
  EMAIL_WORK_ORDER_UPDATES: number;
  CHAT_MESSAGES: number;
  QUIET_HOURS_START: string | null;
  QUIET_HOURS_END: string | null;
  TIMEZONE: string | null;
  DATE_FORMAT: string;
  COMPACT_DENSITY: number;
}

@Component({
  selector: 'cp-profile-drawer',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule],
  templateUrl: './profile-drawer.component.html',
  styleUrls: ['./profile-drawer.component.css']
})
export class ProfileDrawerComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  stack: Panel[] = ['profile'];
  summary: { DISPATCH_VISITS: number; OPEN_TICKETS: number; SLA_MET_PERCENT: number | null; SCOPE_LABEL: string } | null = null;
  settings: Settings | null = null;
  savingSettings = false;

  addresses: any[] = [];
  addressCount = 0;
  addressPage = 1;
  addressPageSize = 30;
  addressSearch = '';
  addressesLoading = false;

  openFaq: number | null = null;
  readonly faqs = [
    { q: 'How do I raise a ticket?', a: 'Choose “Raise a ticket” on the dashboard or the work orders page. Pick the site, the type of visit and service, a priority and the preferred visit date. The service desk accepts it and assigns a technician.' },
    { q: 'Why can’t I pick some sites?', a: 'A site needs a contact person (SPOC) before a technician can be sent there. Ask your Vantage account team to add one.' },
    { q: 'How is SLA calculated?', a: 'SLA starts when your request is accepted and is measured against the response time of the ticket’s priority. Orders that have not been dispatched yet have not had a chance to breach.' },
    { q: 'How do I add or change a site?', a: 'Sites are managed by your Vantage account team. You can choose which site is your default from Saved addresses.' }
  ];

  readonly timezones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'Pacific/Honolulu', 'UTC', 'Asia/Kolkata'];

  constructor(
    public session: SessionService,
    private api: ApiService,
    private auth: AuthService,
    private data: DataService,
    private toast: ToastService
  ) {}

  get panel(): Panel { return this.stack[this.stack.length - 1]; }
  get title(): string {
    return { profile: 'Your profile', settings: 'Settings', addresses: 'Saved addresses', help: 'Help & support' }[this.panel];
  }
  get initials(): string {
    const name = this.session.session?.name || this.session.session?.email || '?';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }
  get isStaff(): boolean { return this.data.isStaff; }

  @HostListener('document:keydown.escape') close(): void { this.closed.emit(); }

  roleName = '';
  siteCount: number | null = null;

  ngOnInit(): void {
    this.api.viewer().subscribe({ next: (r: any) => { if (r?.code === 200) this.roleName = r.data?.ROLE_NAME || ''; }, error: () => {} });
    this.api.addresses(1, '').subscribe({ next: (r: any) => { if (r?.code === 200) this.siteCount = r.count || 0; }, error: () => {} });
    this.api.summary().subscribe({ next: (r: any) => { if (r?.code === 200) this.summary = r.data; }, error: () => {} });
    this.api.settings().subscribe({ next: (r: any) => { if (r?.code === 200) this.settings = r.data; }, error: () => {} });
  }

  open(panel: Panel): void {
    this.stack = [...this.stack, panel];
    if (panel === 'addresses' && !this.addresses.length) this.loadAddresses(1);
  }
  back(): void { this.stack = this.stack.slice(0, -1); }

  // ---- Settings --------------------------------------------------------------
  toggle(key: 'EMAIL_WORK_ORDER_UPDATES' | 'CHAT_MESSAGES' | 'COMPACT_DENSITY'): void {
    if (!this.settings) return;
    this.settings[key] = this.settings[key] ? 0 : 1;
    this.saveSettings(key === 'EMAIL_WORK_ORDER_UPDATES'
      ? (this.settings[key] ? 'Email notifications turned on' : 'Email notifications turned off')
      : 'Settings saved');
  }

  saveSettings(message = 'Settings saved'): void {
    if (!this.settings) return;
    this.savingSettings = true;
    this.api.saveSettings(this.settings).subscribe({
      next: (r: any) => {
        this.savingSettings = false;
        r?.code === 200 ? this.toast.show(message) : this.toast.error(r?.message || 'Could not save settings');
      },
      error: err => { this.savingSettings = false; this.toast.error(err?.error?.message || 'Could not save settings'); }
    });
  }

  // ---- Addresses ---------------------------------------------------------------
  loadAddresses(page: number): void {
    this.addressesLoading = true;
    this.api.addresses(page, this.addressSearch).subscribe({
      next: (r: any) => {
        this.addressesLoading = false;
        if (r?.code !== 200) { this.toast.error(r?.message || 'Could not load sites'); return; }
        this.addressPage = page;
        this.addressCount = r.count || 0;
        this.addressPageSize = r.pageSize || 30;
        this.addresses = r.data || [];
      },
      error: err => {
        this.addressesLoading = false;
        this.toast.error(err?.error?.message === 'Access denied.' ? 'Saved sites are not available for this account.' : 'Could not load sites');
      }
    });
  }

  get addressPages(): number { return Math.max(1, Math.ceil(this.addressCount / this.addressPageSize)); }

  makeDefault(a: any): void {
    this.api.setDefaultAddress(a.ID).subscribe({
      next: (r: any) => {
        if (r?.code === 200) {
          this.toast.show('Default site updated');
          this.loadAddresses(this.addressPage);
        } else {
          this.toast.error(r?.message || 'Could not update the default site');
        }
      },
      error: err => this.toast.error(err?.error?.message || 'Could not update the default site')
    });
  }

  addressLine(a: any): string {
    return [a.ADDRESS_LINE_1, a.ADDRESS_LINE_2, a.CITY_NAME, [a.STATE_NAME, a.PINCODE].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ');
  }

  logout(): void { this.auth.logout(); }
}
