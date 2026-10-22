import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Every backend call the portal makes. Same API as the admin panel; the backend scopes
 *  each one to the signed-in customer (or the customers a staff user is mapped to). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;
  private readonly api = environment.apiUrl + 'api/';

  constructor(private http: HttpClient) {}

  private post<T = any>(url: string, body: object = {}): Observable<T> {
    return this.http.post<T>(url, body);
  }

  // ---- Sign-in (the admin panel's user login, with its MFA steps) ----------
  login(username: string, password: string, deviceId: string, trustedDeviceToken: string | null) {
    return this.post(this.base + 'user/login', { username, password, type: 'U', cloudid: '', DEVICE_ID: deviceId, trustedDeviceToken });
  }
  microsoftLogin(idToken: string, deviceId: string) {
    return this.post(this.base + 'user/microsoftlogin', { idToken, cloudid: '', DEVICE_ID: deviceId });
  }
  /** Login step 2 for an account with an authenticator enrolled. */
  mfaVerifyLogin(mfaToken: string, code: string, rememberDevice: boolean) {
    return this.post(this.base + 'admin/mfa/verifyLogin', { mfaToken, code, rememberDevice });
  }
  /** First-time setup: QR code for the authenticator app (the challenge token goes in `token`). */
  mfaSetup(mfaToken: string) {
    return this.http.post<any>(this.base + 'admin/mfa/setup', {}, { headers: new HttpHeaders({ token: mfaToken }) });
  }
  mfaConfirm(mfaToken: string, code: string, rememberDevice: boolean) {
    return this.http.post<any>(this.base + 'admin/mfa/confirm', { code, rememberDevice }, { headers: new HttpHeaders({ token: mfaToken }) });
  }
  /** "Lost access?" — email an OTP that reopens authenticator setup. */
  mfaRelinkSendOtp(mfaToken: string) {
    return this.post(this.base + 'admin/mfa/relink/sendOtp', { mfaToken });
  }
  mfaRelinkVerifyOtp(relinkToken: string, otp: string) {
    return this.post(this.base + 'admin/mfa/relink/verifyOtp', { relinkToken, otp });
  }
  sendResetOtp(email: string) {
    return this.post(this.base + 'admin/sendOTP', { EMAIL_ID: email });
  }
  verifyResetOtp(email: string, otp: string) {
    return this.post(this.base + 'admin/verifyOTP', { EMAIL_ID: email, OTP: otp });
  }
  changePassword(email: string, newPassword: string, resetToken: string) {
    return this.post(this.base + 'admin/changePassword', { USER_NAME: email, NEW_PASSWORD: newPassword, RESET_TOKEN: resetToken });
  }
  logout(userId: number, roleId: number) {
    return this.post(this.api + 'user/logout', { USER_ID: userId, ROLE_ID: roleId });
  }

  // ---- Work orders (one row per order, scoped by the backend) ----------------
  dashboard(customerId?: number) {
    return this.post(this.api + 'customerDashboard/get', customerId ? { CUSTOMER_ID: customerId } : {});
  }
  ticketOptions(customerId: number) {
    return this.post(this.api + 'customerDashboard/ticketOptions', { CUSTOMER_ID: customerId });
  }
  createTicket(body: object) {
    return this.post(this.api + 'customerDashboard/createTicket', body);
  }
  /** The Raise tickets list (server-side scoped, filter built on the server). */
  orders(body: { pageIndex: number; pageSize: number; search?: string; STATUS_IDS?: number[]; FROM_DATE?: string; TO_DATE?: string; CUSTOMER_ID?: number | null }) {
    return this.post(this.api + 'customerDashboard/orders', body);
  }
  /** Fields a Duplicate pre-fills, for an order in the caller's scope. */
  /** Edit a created, not yet accepted order (scoped and checked on the server). */
  updateTicket(body: object) {
    return this.post(this.api + 'customerDashboard/updateTicket', body);
  }
  /** Work Order Details: the order, its lines, job cards, technicians and completion files (scoped). */
  orderView(orderId: number) { return this.post(this.api + 'customerDashboard/orderView', { ORDER_ID: orderId }); }
  activityLog(orderId: number, pageIndex = 1, pageSize = 50) {
    return this.post(this.api + 'customerDashboard/activityLog', { ORDER_ID: orderId, pageIndex, pageSize });
  }
  updateDescription(orderId: number, html: string) {
    return this.post(this.api + 'customerDashboard/updateDescription', { ORDER_ID: orderId, REMARK: html });
  }
  cancelReasons() { return this.post(this.api + 'customerDashboard/cancelReasons', {}); }
  cancelTicket(orderId: number, reason: string, remark: string) {
    return this.post(this.api + 'customerDashboard/cancelTicket', { ORDER_ID: orderId, REASON: reason, REMARK: remark });
  }
  /** Files the API serves statically (attachments, job photos, site visit reports). */
  staticUrl(folder: string, name: string): string { return this.base + 'static/' + folder + '/' + encodeURIComponent(name || ''); }
  orderTemplate(orderId: number) {
    return this.post(this.api + 'customerDashboard/orderTemplate', { ORDER_ID: orderId });
  }
  /** A site's SPOCs, primary first (scoped to the caller on the server): active only, or all. */
  siteSpocs(customerId: number, addressId: number, all = false) {
    return this.post(this.api + 'customerDashboard/siteSpocs', { CUSTOMER_ID: customerId, ADDRESS_ID: addressId, ALL: all });
  }
  /** Add or edit one SPOC of a site (Map SPOC(s)); returns the site's SPOCs. */
  saveSpoc(body: {
    CUSTOMER_ID: number; ADDRESS_ID: number; ID: number | null; FULL_NAME: string; EMAIL_ID: string;
    MOBILE_NUMBER: string; COUNTRY_CODE: string; IS_PRIMARY: boolean; IS_ACTIVE: boolean;
  }) {
    return this.post(this.api + 'customerDashboard/saveSpoc', body);
  }
  techLevels() { return this.post(this.api + 'techLevel/get'); }
  /** Upload a work order attachment; the file is stored as `fileName` in OrderAttachments. */
  uploadAttachment(file: File, fileName: string) {
    const fd = new FormData();
    fd.append('Image', file, fileName);
    return this.http.post<any>(this.api + 'upload/OrderAttachments', fd);
  }

  // ---- Profile -------------------------------------------------------------
  viewer() { return this.post(this.api + 'profile/getViewer'); }
  summary() { return this.post(this.api + 'profile/getSummary'); }
  customers() { return this.post(this.api + 'profile/getCustomers'); }
  addresses(pageIndex: number, search: string) {
    return this.post(this.api + 'profile/getAddresses', { pageIndex, search });
  }
  setDefaultAddress(addressId: number) {
    return this.post(this.api + 'profile/setDefaultAddress', { ADDRESS_ID: addressId });
  }
  settings() { return this.post(this.api + 'profile/getSettings'); }
  saveSettings(body: object) { return this.post(this.api + 'profile/saveSettings', body); }
}
