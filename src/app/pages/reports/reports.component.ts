import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { nf } from '../../core/format';

@Component({
  selector: 'cp-reports',
  standalone: true,
  imports: [NgIf, RouterLink],
  template: `
    <main class="page">
      <h1 class="h1">Reports</h1>
      <p class="lead">Self-serve reports for {{ customerName || 'your account' }}. Every report respects your filters and exports to CSV.</p>
      <div class="lib">
        <a class="card report" routerLink="/reports/work-orders">
          <div class="row">
            <span class="ico" aria-hidden="true">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#B0102A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.4h8.4L19 8v12.6H6z"/><path d="M14 3.4V8h5"/><path d="M9 17v-3M12 17v-6M15 17v-4"/></svg>
            </span>
            <span class="grow">
              <b>Customer work order report</b>
              <small>Work orders · stage · technician · schedule</small>
            </span>
            <span class="chev">›</span>
          </div>
          <p>Every work order raised for your account, with its current stage, assigned technician, visit slot and priority. Filter by date, stage, state or visit type, then export.</p>
          <div class="row foot">
            <span class="meta" *ngIf="count !== null">{{ nf(count) }} work orders</span>
            <span class="meta">CSV</span>
            <span class="spacer"></span>
            <span class="open">Open report</span>
          </div>
        </a>
      </div>
    </main>
  `,
  styles: [`
    .lead { margin: 4px 0 18px; font-size: 14px; color: var(--ink-3); }
    .lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
    .report { display: flex; flex-direction: column; gap: 14px; padding: 20px 22px; color: inherit; text-decoration: none; }
    .report:hover { border-color: var(--brand-tint-border); box-shadow: 0 10px 26px rgba(176,16,42,.08); text-decoration: none; color: inherit; }
    .ico { width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; background: var(--brand-tint); border: 1px solid var(--brand-tint-border); display: grid; place-items: center; margin-right: 4px; }
    b { display: block; font-size: 16px; font-weight: 800; }
    small { display: block; font-size: 12.5px; font-weight: 600; color: var(--muted); margin-top: 2px; }
    .chev { font-size: 22px; color: var(--faint); }
    p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--ink-2); }
    .foot { padding-top: 13px; border-top: 1px solid var(--row-line); }
    .meta { font-size: 12px; font-weight: 800; color: var(--ink-2); background: var(--bg); border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; }
    .open { font-size: 13px; font-weight: 800; color: var(--brand); }
  `]
})
export class ReportsComponent implements OnInit, OnDestroy {
  private sub?: Subscription;
  readonly nf = nf;
  customerName = '';
  count: number | null = null;

  constructor(private data: DataService) {}

  ngOnInit(): void {
    this.sub = this.data.watch().subscribe({
      next: d => { this.customerName = d.customerName; this.count = d.tickets.length; },
      error: () => (this.count = null)
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
