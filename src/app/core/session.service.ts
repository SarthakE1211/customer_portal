import { Injectable } from '@angular/core';

/** Who is signed in: a Customer Side User (roles 2/26) with a panel token from user/login.
 *  (`kind` is always 'staff' now; customer-account logins are not offered.) */
export interface Session {
  token: string;
  kind: 'customer' | 'staff';
  userId: number;
  roleId: number;
  name: string;
  email: string;
  phone: string;
}

/** Customer Side User roles — the only accounts the portal signs in
 *  (backend CUSTOMER_SIDE_ROLE_IDS). The server enforces this; the client only fails fast. */
export const PORTAL_ROLES = [2, 26];

const SESSION_KEY = 'cp_session';
const DEVICE_KEY = 'cp_device';
const TRUSTED_DEVICE_KEY = 'cp_trusted_device';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private current: Session | null = this.read();
  readonly supportKey = Math.random().toString(36).slice(2, 12);

  get session(): Session | null { return this.current; }
  get isSignedIn(): boolean { return !!this.current?.token; }

  start(session: Session): void {
    this.current = session;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  end(): void {
    this.current = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  /** Stable per-browser id, sent as DEVICE_ID (the backend binds MFA trusted devices to it). */
  get deviceId(): string {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  get trustedDeviceToken(): string | null { return localStorage.getItem(TRUSTED_DEVICE_KEY); }
  set trustedDeviceToken(value: string | null) {
    if (value) localStorage.setItem(TRUSTED_DEVICE_KEY, value);
    else localStorage.removeItem(TRUSTED_DEVICE_KEY);
  }

  private read(): Session | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) as Session : null;
    } catch {
      return null;
    }
  }
}
