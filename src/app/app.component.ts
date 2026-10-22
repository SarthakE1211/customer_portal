import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'cp-root',
  standalone: true,
  imports: [RouterOutlet, NgIf],
  template: `
    <router-outlet></router-outlet>
    <div class="toast" *ngIf="toast.message" [class.err]="toast.isError" role="status">
      <svg *ngIf="!toast.isError" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#7BD9A5" stroke-width="2.6" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
      {{ toast.message }}
    </div>
  `
})
export class AppComponent {
  constructor(public toast: ToastService) {}
}
