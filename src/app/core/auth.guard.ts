import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

export const signedInGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  return session.isSignedIn ? true : inject(Router).createUrlTree(['/login']);
};

export const signedOutGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  return session.isSignedIn ? inject(Router).createUrlTree(['/dashboard']) : true;
};
