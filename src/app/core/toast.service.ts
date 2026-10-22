import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  message: string | null = null;
  isError = false;
  private timer: any;

  show(message: string, isError = false): void {
    this.message = message;
    this.isError = isError;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.message = null), 3200);
  }

  error(message: string): void { this.show(message, true); }
}
