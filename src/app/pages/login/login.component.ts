import { Component, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService, LoginResult } from '../../core/auth.service';
import { MicrosoftAuthService } from '../../core/microsoft-auth.service';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';

/** One form, several steps — the same sequence as the admin console's login. */
type Step = 'login' | 'mfa' | 'enroll' | 'relink' | 'forgot' | 'otp' | 'newPassword';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Same rule as the admin console: 8-20 characters, one uppercase, one number, one special.
const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;

@Component({
  selector: 'cp-login',
  standalone: true,
  imports: [NgIf, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  step: Step = 'login';
  busy = false;
  microsoftBusy = false;
  completingMicrosoft = false;

  email = '';
  password = '';
  showPassword = false;

  mfaToken = '';
  mfaCode = '';
  rememberDevice = false;
  rememberHours = 0;
  qrCode = '';
  manualSecret = '';
  showManualSecret = false;
  relinkToken = '';
  relinkOtp = '';

  otp = '';
  newPassword = '';
  confirmPassword = '';
  showNewPassword = false;
  showConfirmPassword = false;
  private resetToken = '';

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private microsoft: MicrosoftAuthService,
    private session: SessionService,
    private toast: ToastService,
    private router: Router,
    route: ActivatedRoute
  ) {
    if (route.snapshot.queryParamMap.get('expired')) setTimeout(() => this.toast.error('Your session ended. Please log in again.'));
  }

  ngOnInit(): void {
    // Coming back from Microsoft: finish the sign in without showing the form.
    const idToken = this.microsoft.consumeIdToken();
    if (idToken) {
      this.completingMicrosoft = true;
      this.microsoftBusy = true;
      this.run(this.api.microsoftLogin(idToken, this.session.deviceId), 'Microsoft sign in failed.');
    } else if (this.microsoft.consumeRedirectFailure()) {
      setTimeout(() => this.toast.error('Microsoft sign in did not complete. Please try again.'));
    }
  }

  get inMfa(): boolean { return this.step === 'mfa' || this.step === 'enroll' || this.step === 'relink'; }

  // ---- Password login ------------------------------------------------------------
  login(): void {
    if (!this.email.trim() && !this.password) return this.toast.error('Please Enter Email ID and Password.');
    if (!EMAIL.test(this.email.trim())) return this.toast.error('Please Enter Valid Email ID');
    if (!this.password.trim()) return this.toast.error('Please Enter Password');
    this.run(this.api.login(this.email.trim(), this.password, this.session.deviceId, this.session.trustedDeviceToken));
  }

  async microsoftLogin(): Promise<void> {
    if (this.microsoftBusy) return;
    this.microsoftBusy = true;
    try {
      await this.microsoft.signIn();
    } catch {
      this.microsoftBusy = false;
      this.toast.error('Could not start Microsoft sign in. Please try again.');
    }
  }

  /** Every login-shaped call ends here: a session, an MFA step, or an error. */
  private run(call: Observable<any>, fallback = 'You have entered wrong credentials'): void {
    this.busy = true;
    call.subscribe({
      next: res => this.after(this.auth.handleLoginResponse(res), fallback),
      error: err => {
        this.busy = this.microsoftBusy = this.completingMicrosoft = false;
        this.toast.error(err?.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.'
          : err?.error?.message || 'Something went wrong. Please try again later.');
      }
    });
  }

  private after(result: LoginResult, fallback: string): void {
    this.busy = false;
    if (result.kind === 'done') {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.microsoftBusy = this.completingMicrosoft = false;
    if (result.kind === 'error') {
      this.microsoft.clearCache();
      this.toast.error(result.message || fallback);
    } else {
      this.mfaToken = result.mfaToken;
      this.rememberHours = result.rememberHours;
      this.rememberDevice = false;
      this.mfaCode = '';
      if (result.kind === 'mfa') this.step = 'mfa';
      else this.startEnrollment();
    }
  }

  // ---- MFA ---------------------------------------------------------------------------
  private codeOk(): boolean {
    const code = this.mfaCode.trim();
    if (!code) { this.toast.error('Please Enter Authentication Code'); return false; }
    if (!/^\d{6}$/.test(code)) { this.toast.error('Please Enter Valid Authentication Code'); return false; }
    return true;
  }

  verifyMfa(): void {
    if (this.codeOk()) this.run(this.api.mfaVerifyLogin(this.mfaToken, this.mfaCode.trim(), this.rememberDevice), 'Invalid code.');
  }

  /** First-time setup (forced on first login) — also reused after a "Lost access?" re-link. */
  startEnrollment(): void {
    this.busy = true;
    this.api.mfaSetup(this.mfaToken).subscribe({
      next: (r: any) => {
        this.busy = false;
        if (Number(r?.code) === 200) {
          this.qrCode = r.data?.qrCodeDataUrl || '';
          this.manualSecret = r.data?.manualEntrySecret || '';
          this.showManualSecret = false;
          this.mfaCode = '';
          this.step = 'enroll';
        } else {
          this.toast.error(r?.message || 'Could not start two-factor setup.');
        }
      },
      error: err => { this.busy = false; this.toast.error(err?.error?.message || 'Could not start two-factor setup.'); }
    });
  }

  confirmEnrollment(): void {
    if (!this.codeOk()) return;
    this.busy = true;
    this.api.mfaConfirm(this.mfaToken, this.mfaCode.trim(), this.rememberDevice).subscribe({
      next: (r: any) => {
        // The backend completes the login on a login-time enrollment: a normal login response.
        if (Number(r?.code) === 200 && r?.data) return this.after(this.auth.handleLoginResponse(r), 'Invalid code.');
        this.busy = false;
        if (Number(r?.code) === 200) {
          this.toast.show('Two-factor authentication enabled. Please log in.');
          this.backToLogin();
        } else {
          this.toast.error(r?.message || 'Invalid code.');
        }
      },
      error: err => { this.busy = false; this.toast.error(err?.error?.message || 'Invalid code.'); }
    });
  }

  sendRelinkOtp(): void {
    this.busy = true;
    this.api.mfaRelinkSendOtp(this.mfaToken).subscribe({
      next: (r: any) => {
        this.busy = false;
        if (Number(r?.code) === 200) {
          this.relinkToken = r.relinkToken;
          this.relinkOtp = '';
          this.toast.show('OTP sent' + (r.email ? ' to ' + r.email : ''));
          this.step = 'relink';
        } else {
          this.toast.error(r?.message || 'Failed to send OTP');
        }
      },
      error: err => { this.busy = false; this.toast.error(err?.error?.message || 'Failed to send OTP'); }
    });
  }

  verifyRelinkOtp(): void {
    if (!/^\d{4,6}$/.test(this.relinkOtp.trim())) return this.toast.error('Please Enter Valid OTP');
    this.busy = true;
    this.api.mfaRelinkVerifyOtp(this.relinkToken, this.relinkOtp.trim()).subscribe({
      next: (r: any) => {
        if (Number(r?.code) === 200 && r.enrollToken) {
          this.toast.show('OTP verified — set up your authenticator again');
          this.mfaToken = r.enrollToken;
          this.startEnrollment();
        } else {
          this.busy = false;
          this.toast.error(r?.message || 'OTP Verification Failed');
        }
      },
      error: err => { this.busy = false; this.toast.error(err?.error?.message || 'OTP Verification Failed'); }
    });
  }

  /** Back from the lost-access OTP returns to the code step; from anywhere else, to the login. */
  back(): void {
    if (this.step === 'relink') {
      this.step = 'mfa';
      this.relinkOtp = this.relinkToken = '';
    } else {
      this.backToLogin();
    }
  }

  backToLogin(): void {
    this.step = 'login';
    this.mfaToken = this.mfaCode = this.qrCode = this.manualSecret = this.relinkToken = this.relinkOtp = '';
    this.otp = this.newPassword = this.confirmPassword = this.resetToken = '';
    this.password = '';
    this.rememberDevice = false;
  }

  // ---- Forgot password -------------------------------------------------------------
  sendResetOtp(): void {
    if (!EMAIL.test(this.email.trim())) return this.toast.error('Please Enter Valid Email ID');
    this.busy = true;
    this.api.sendResetOtp(this.email.trim()).subscribe({
      next: (r: any) => {
        this.busy = false;
        if (Number(r?.code) === 200) {
          this.toast.show('OTP sent successfully');
          this.otp = '';
          this.step = 'otp';
        } else {
          this.toast.error(r?.message || 'Failed to send OTP');
        }
      },
      error: err => { this.busy = false; this.toast.error(err?.error?.message || 'Something went wrong, please try again later'); }
    });
  }

  verifyResetOtp(): void {
    if (!/^\d{4}$/.test(this.otp.trim())) return this.toast.error('Please Enter Valid OTP');
    this.busy = true;
    this.api.verifyResetOtp(this.email.trim(), this.otp.trim()).subscribe({
      next: (r: any) => {
        this.busy = false;
        if (Number(r?.code) === 200 && r.RESET_TOKEN) {
          this.resetToken = r.RESET_TOKEN;
          this.toast.show('OTP verified successfully');
          this.step = 'newPassword';
        } else {
          this.toast.error(Number(r?.code) === 300 ? 'Invalid OTP. Please check and enter a valid OTP' : r?.message || 'OTP Verification Failed');
        }
      },
      error: err => {
        this.busy = false;
        this.toast.error(err?.error?.code === 300 ? 'Invalid OTP. Please check and enter a valid OTP' : 'Something went wrong, please try again later');
      }
    });
  }

  get passwordRuleMet(): boolean { return PASSWORD_RULE.test(this.newPassword); }

  updatePassword(): void {
    if (!this.passwordRuleMet) return this.toast.error('Password must be 8–20 characters with 1 uppercase letter, 1 number and 1 special character.');
    if (this.newPassword !== this.confirmPassword) return this.toast.error('The new password and the confirmation password do not match.');
    this.busy = true;
    this.api.changePassword(this.email.trim(), this.newPassword, this.resetToken).subscribe({
      next: (r: any) => {
        this.busy = false;
        if (Number(r?.code) === 200) {
          this.toast.show('Password updated successfully. Please log in.');
          this.backToLogin();
        } else {
          this.toast.error(r?.message || 'Password update failed');
        }
      },
      error: () => { this.busy = false; this.toast.error('Something went wrong, please try again later'); }
    });
  }

  onlyDigits(ev: KeyboardEvent): void {
    if (ev.key.length === 1 && !/\d/.test(ev.key)) ev.preventDefault();
  }
}
