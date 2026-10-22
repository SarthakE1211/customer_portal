import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { SessionService } from './session.service';

/** Adds the Vantage API headers and signs the user out when the backend rejects the token
 *  (HTTP 401/403 or the body-level code 303 "Invalid token"). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);
  const session = inject(SessionService);
  const router = inject(Router);

  const headers: Record<string, string> = {
    deviceid: session.deviceId,
    supportkey: session.supportKey,
    type: 'U'
  };
  // MFA setup/confirm send their challenge token themselves; don't replace it.
  if (session.session?.token && !req.headers.has('token')) headers['token'] = session.session.token;

  const isAuthCall = /\/(user|customer|admin\/mfa)\//.test(req.url) && !req.url.includes('/api/');
  const signOut = () => {
    if (isAuthCall || !session.isSignedIn) return;
    session.end();
    router.navigate(['/login'], { queryParams: { expired: 1 } });
  };

  return next(req.clone({ setHeaders: headers })).pipe(
    tap({
      next: event => {
        if (event instanceof HttpResponse && (event.body as any)?.code === 303) signOut();
      },
      error: err => {
        // 403 is also how some endpoints refuse a single action, so only the token-level
        // refusals from checkToken end the session.
        const msg = err?.error?.message;
        if (err?.status === 401 || (err?.status === 403 && (msg === 'Forbidden' || msg === 'This account is not a customer portal user.'))) {
          signOut();
        }
      }
    })
  );
};
