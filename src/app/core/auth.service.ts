import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { DataService } from './data.service';
import { PORTAL_ROLES, SessionService } from './session.service';

/** What the login page has to do after a sign-in step. */
export type LoginResult =
  | { kind: 'done' }
  | { kind: 'mfa'; mfaToken: string; rememberHours: number }
  | { kind: 'mfa-setup'; mfaToken: string; rememberHours: number }
  | { kind: 'error'; message: string };

/** The server's own default when it doesn't say (only an explicit 0 turns the option off). */
const DEFAULT_REMEMBER_HOURS = 24;

/**
 * Sign-in for Customer Side Users: the admin panel's user login (password or Microsoft),
 * then MFA — a code from the authenticator, or first-time setup. Only CUSTOMER_SIDE roles
 * get a portal session; the backend refuses every other role on this domain as well.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private api: ApiService,
    private session: SessionService,
    private data: DataService,
    private router: Router
  ) {}

  /** Turns any login-shaped response (password, Microsoft, MFA verify/confirm) into a result. */
  handleLoginResponse(res: any): LoginResult {
    const rememberHours = res?.rememberDeviceHours === undefined || res?.rememberDeviceHours === null
      ? DEFAULT_REMEMBER_HOURS : Number(res.rememberDeviceHours);
    if (Number(res?.code) === 210 && res.mfaToken) {
      // The server saw our trusted-device grant and refused it; it never accepts it again.
      if (res.trustedDeviceRejected) this.session.trustedDeviceToken = null;
      return { kind: 'mfa', mfaToken: res.mfaToken, rememberHours };
    }
    if (Number(res?.code) === 211 && res.mfaToken) return { kind: 'mfa-setup', mfaToken: res.mfaToken, rememberHours };

    const payload = Array.isArray(res?.data) ? res.data[0] : null;
    if (Number(res?.code) !== 200 || !payload?.token) {
      return { kind: 'error', message: res?.message && Number(res?.code) !== 200 && !/success/i.test(res.message) ? res.message : 'You have entered wrong credentials' };
    }
    const u = (payload.UserData || [])[0] || {};
    const roleId = Number(u.ROLE_ID);
    if (!PORTAL_ROLES.includes(roleId)) {
      return { kind: 'error', message: 'This account cannot sign in to the customer portal. Please use the Vantage console.' };
    }
    if (res.trustedDeviceToken) this.session.trustedDeviceToken = res.trustedDeviceToken;
    this.session.start({
      token: payload.token,
      kind: 'staff',
      userId: Number(u.USER_ID),
      roleId,
      name: u.NAME || u.USER_NAME || '',
      email: u.EMAIL_ID || '',
      phone: u.MOBILE_NUMBER ? String(u.MOBILE_NUMBER) : ''
    });
    return { kind: 'done' };
  }

  logout(): void {
    const s = this.session.session;
    const finish = () => {
      this.session.end();
      this.data.clear();
      this.router.navigate(['/login']);
    };
    if (!s) return finish();
    this.api.logout(s.userId, s.roleId).subscribe({ next: finish, error: finish });
  }
}
