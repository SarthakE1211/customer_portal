import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { ApiService } from '../../core/api.service';
import { clampMobile, COUNTRY_CODES, isValidMobile, mobileLength, mobileLengthLabel, mobilePlaceholder } from '../../core/phone';
import { ToastService } from '../../core/toast.service';

interface Contact {
  ID: number | null;
  FULL_NAME: string;
  EMAIL_ID: string;
  MOBILE_NUMBER: string;
  COUNTRY_CODE: string;
  IS_PRIMARY: boolean;
  IS_ACTIVE: boolean;
}

const EMAIL = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * Map SPOC(s) — the admin panel's address-spoc drawer for one service address: add a SPOC
 * or edit one from the list, with Is Primary? and Status. Each Add SPOC / Update saves at
 * once through customerDashboard/saveSpoc, which checks the site is in the caller's scope.
 */
@Component({
  selector: 'cp-map-spoc',
  standalone: true,
  imports: [
    NgIf, NgFor, FormsModule, NzButtonModule, NzDividerModule, NzFormModule, NzGridModule, NzIconModule, NzInputModule,
    NzSelectModule, NzSpinModule, NzSwitchModule, NzTableModule, NzTagModule, NzToolTipModule
  ],
  templateUrl: './map-spoc.component.html',
  styleUrls: ['./map-spoc.component.css']
})
export class MapSpocComponent implements OnInit {
  @Input() customerId!: number;
  @Input() addressId!: number;
  @Output() closed = new EventEmitter<void>();

  readonly countryCodes = COUNTRY_CODES;
  readonly placeholder = mobilePlaceholder;
  readonly maxLength = (code: string) => mobileLength(code).max;
  readonly minLength = (code: string) => mobileLength(code).min;

  pageIndex = 1;
  pageSize = 10;
  isSpinning = false;
  isFocused = '';
  editingIndex: number | null = null;
  contactData: Contact[] = [];
  formData: Contact = this.blank();

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void { this.getSpocMapping(); }

  private blank(): Contact {
    return { ID: null, FULL_NAME: '', EMAIL_ID: '', MOBILE_NUMBER: '', COUNTRY_CODE: '+91', IS_PRIMARY: true, IS_ACTIVE: true };
  }
  resetForm(): void {
    this.formData = this.blank();
    this.editingIndex = null;
  }

  private load(rows: any[]): void {
    this.contactData = (rows || []).map(c => ({
      ID: c.ID, FULL_NAME: c.FULL_NAME || '', EMAIL_ID: c.EMAIL_ID || '', MOBILE_NUMBER: c.MOBILE_NUMBER || '',
      COUNTRY_CODE: c.COUNTRY_CODE || '', IS_PRIMARY: Number(c.IS_PRIMARY) === 1, IS_ACTIVE: Number(c.IS_ACTIVE) === 1
    }));
  }

  getSpocMapping(): void {
    this.isSpinning = true;
    this.api.siteSpocs(this.customerId, this.addressId, true).subscribe({
      next: (r: any) => {
        this.isSpinning = false;
        if (r?.code === 200) this.load(r.data);
        else { this.contactData = []; this.toast.error(r?.message || 'Something Went Wrong ...'); }
      },
      error: () => { this.isSpinning = false; this.contactData = []; this.toast.error('Something Went Wrong ...'); }
    });
  }

  editContact(data: Contact, index: number): void {
    this.formData = { ...data, COUNTRY_CODE: data.COUNTRY_CODE || '+91' };
    this.editingIndex = (this.pageIndex - 1) * this.pageSize + index;
  }

  onCountryCodeChange(code: string): void {
    if (this.formData.MOBILE_NUMBER) this.formData.MOBILE_NUMBER = clampMobile(code, this.formData.MOBILE_NUMBER);
  }
  omit(ev: KeyboardEvent): void {
    if (ev.key.length === 1 && !/\d/.test(ev.key)) ev.preventDefault();
  }

  mapSpoc(): void {
    const c = this.formData;
    if (!c.FULL_NAME || !c.FULL_NAME.trim()) return this.toast.error('Please Enter Full Name.');
    if (!c.EMAIL_ID) return this.toast.error('Please Enter Email ID');
    if (!EMAIL.test(c.EMAIL_ID)) return this.toast.error('Please enter Valid Email');
    if (c.MOBILE_NUMBER && !isValidMobile(c.COUNTRY_CODE, c.MOBILE_NUMBER)) {
      return this.toast.error(`${c.COUNTRY_CODE || 'This country code'} needs ${mobileLengthLabel(c.COUNTRY_CODE)}. Please check the mobile number.`);
    }
    if (c.MOBILE_NUMBER && !c.COUNTRY_CODE) return this.toast.error('Please select country code');
    const others = this.contactData.filter((_, i) => i !== this.editingIndex);
    if (others.some(o => o.EMAIL_ID.toLowerCase() === c.EMAIL_ID.toLowerCase())) return this.toast.error('Email is exists already');
    if (c.MOBILE_NUMBER && others.some(o => o.MOBILE_NUMBER && o.MOBILE_NUMBER === c.MOBILE_NUMBER)) {
      return this.toast.error('Mobile number already exists');
    }

    this.isSpinning = true;
    this.api.saveSpoc({
      CUSTOMER_ID: this.customerId, ADDRESS_ID: this.addressId, ID: c.ID, FULL_NAME: c.FULL_NAME.trim(),
      EMAIL_ID: c.EMAIL_ID.trim(), MOBILE_NUMBER: c.MOBILE_NUMBER, COUNTRY_CODE: c.COUNTRY_CODE,
      IS_PRIMARY: c.IS_PRIMARY, IS_ACTIVE: c.IS_ACTIVE
    }).subscribe({
      next: (r: any) => {
        this.isSpinning = false;
        if (r?.code === 200) {
          this.toast.show('SPOC mapped successfully');
          this.resetForm();
          this.load(r.data);
        } else {
          this.toast.error(r?.message || 'Failed to map SPOC');
        }
      },
      error: err => { this.isSpinning = false; this.toast.error(err?.error?.message || 'Failed to push SPOC'); }
    });
  }

  close(): void { this.closed.emit(); }
}
