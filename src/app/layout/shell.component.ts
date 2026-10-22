import { Component, OnInit } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Observable } from 'rxjs';
import { CustomerOption, DataService } from '../core/data.service';
import { SessionService } from '../core/session.service';
import { ProfileDrawerComponent } from './profile-drawer.component';

@Component({
  selector: 'cp-shell',
  standalone: true,
  imports: [NgIf, NgFor, AsyncPipe, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, ProfileDrawerComponent],
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.css']
})
export class ShellComponent implements OnInit {
  drawerOpen = false;
  search = '';
  customers$!: Observable<CustomerOption[]>;
  selectedCustomer: number | null = null;

  constructor(public session: SessionService, public data: DataService, private router: Router) {}

  get onDashboard(): boolean { return this.router.url.split('?')[0] === '/dashboard'; }

  get initials(): string {
    const name = this.session.session?.name || this.session.session?.email || '?';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  ngOnInit(): void {
    if (this.data.isStaff) this.customers$ = this.data.customers();
    this.selectedCustomer = this.data.selectedCustomer$.value;
  }

  pickCustomer(value: string): void {
    this.selectedCustomer = value ? Number(value) : null;
    // Pages listen to the selection (DataService.tickets$) and reload on their own.
    this.data.selectCustomer(this.selectedCustomer);
  }

  runSearch(): void {
    const q = this.search.trim();
    this.router.navigate(['/work-orders'], { queryParams: q ? { q } : {} });
  }
}
