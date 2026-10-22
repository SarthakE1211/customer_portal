import { Injectable } from '@angular/core';
import { AuthenticationResult, PublicClientApplication } from '@azure/msal-browser';
import { environment } from '../../environments/environment';

const LOGIN_SCOPES = ['openid', 'profile', 'email', 'User.Read'];

/**
 * Microsoft 365 sign in, same as the admin panel. The browser goes to Microsoft and comes
 * back with the response in the URL; that is read at startup (APP_INITIALIZER in main.ts),
 * before the router strips it, and parked here for the login page. The id_token is only
 * passed to our backend (user/microsoftlogin), which issues the normal session.
 */
@Injectable({ providedIn: 'root' })
export class MicrosoftAuthService {
  private readonly msal = new PublicClientApplication({
    auth: {
      clientId: environment.msal.clientId,
      authority: `https://login.microsoftonline.com/${environment.msal.tenantId}`,
      redirectUri: window.location.origin,
      navigateToLoginRequestUrl: false
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
  });
  private initialised = false;
  private pendingIdToken: string | null = null;
  private redirectFailed = false;

  private async ensureInitialised(): Promise<void> {
    if (!this.initialised) {
      await this.msal.initialize();
      this.initialised = true;
    }
  }

  /** Startup hook: picks up the id_token when this page load is the return from Microsoft. */
  async handleRedirect(): Promise<void> {
    try {
      await this.ensureInitialised();
      const result: AuthenticationResult | null = await this.msal.handleRedirectPromise();
      if (result?.idToken) this.pendingIdToken = result.idToken;
    } catch (error) {
      // Never block the app from booting; the login page reports it.
      console.error('Microsoft redirect could not be processed', error);
      this.redirectFailed = true;
    }
  }

  consumeIdToken(): string | null {
    const token = this.pendingIdToken;
    this.pendingIdToken = null;
    return token;
  }

  consumeRedirectFailure(): boolean {
    const failed = this.redirectFailed;
    this.redirectFailed = false;
    return failed;
  }

  /** Leaves the app for Microsoft; nothing after this runs. */
  async signIn(): Promise<void> {
    await this.ensureInitialised();
    this.msal.setActiveAccount(null);
    await this.msal.loginRedirect({ scopes: LOGIN_SCOPES, prompt: 'select_account' });
  }

  async clearCache(): Promise<void> {
    try {
      await this.ensureInitialised();
      this.msal.setActiveAccount(null);
    } catch { /* nothing to clear */ }
  }
}
