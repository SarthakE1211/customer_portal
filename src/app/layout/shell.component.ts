import { Component } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { DataService } from '../core/data.service';
import { SessionService } from '../core/session.service';
import { ProfileDrawerComponent } from './profile-drawer.component';

@Component({
  selector: 'cp-shell',
  standalone: true,
  imports: [NgIf, AsyncPipe, FormsModule, RouterOutlet, RouterLink, RouterLinkActive, ProfileDrawerComponent],
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.css']
})
export class ShellComponent {
  drawerOpen = false;
  search = '';
  readonly version = environment.version;
  /** Shown under the user's name, as in the admin header. */
  customerName$: Observable<string> = this.data.watch().pipe(map(d => d.customerName), catchError(() => of('')));

  constructor(public session: SessionService, public data: DataService, private router: Router) {}

  get initials(): string {
    const name = this.session.session?.name || this.session.session?.email || '?';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  openProfile(): void { this.drawerOpen = true; }

  runSearch(): void {
    const q = this.search.trim();
    this.router.navigate(['/work-orders'], { queryParams: q ? { q } : {} });
  }
}
