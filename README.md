# Vantage customer portal

The separate frontend for customer-side users, on its own domain. It uses the same backend as
the admin panel (`PreProduction_Backend_vantage`); only the frontend is different.

Who can sign in: **Customer Side Users only**, meaning user_master accounts whose role is in
`CUSTOMER_SIDE_ROLE_IDS` (default 2, 26). The login page looks like the admin console's and runs
the same steps:

- Email ID + password (`user/login`), or **Sign in with Microsoft** (`user/microsoftlogin`).
- **Two-factor authentication**:
  - A code from the authenticator app (`admin/mfa/verifyLogin`), with "remember this device".
  - First-time QR setup (`admin/mfa/setup` → `confirm`).
  - "Lost access?" re-link by emailed OTP.
- Forgot Password: email OTP → new password (`admin/sendOTP`, `verifyOTP`, `changePassword`).

On the portal domain the backend (`checkToken`) refuses every other session: admin and SDM
roles, and customer_master (customer-app) tokens. The admin panel itself is unchanged.

Microsoft sign-in uses the admin panel's Entra ID app (`environment.msal`). Add each portal
origin, including `http://localhost:4701` for local dev, as an **SPA redirect URI** on that app
registration; otherwise Microsoft rejects the sign-in.

## Pages

- **Dashboard**: stage cards, month-on-month trend, priority mix and SLA, ranked breakdown,
  high-effort remote areas, and a work order detail table. Filters, saved views, the Customise
  panel and CSV export are kept per browser.
- **Work orders**: grid and list views, search, stage and priority filters, CSV export.
- **Reports**: the Customer work order report.
- **Raise a ticket**: the admin form field for field (ng-zorro selects, date and time pickers, SPOC
  Details with New SPOC), then Type of visit, Type of work and service, then priority and
  visit slot.
- **Profile drawer**: summary, notification settings, saved sites (set the default), help.

Customer-side staff also get a customer picker in the header, listing the customers they are
mapped to.

## Backend calls

All of these are already scoped on the server to the caller's customer (or mapped customers):

`api/customerDashboard/get`, `orders`, `orderTemplate`, `ticketOptions`, `siteSpocs`, `saveSpoc`, `createTicket`, `updateTicket`, `orderView`, `activityLog`, `cancelReasons`, `cancelTicket` ·
`api/profile/getViewer`, `getSummary`, `getCustomers`, `getAddresses`, `setDefaultAddress`,
`getSettings`, `saveSettings` · `api/user/logout`

## Run locally

```
npm install
npm start            # http://localhost:4701, API at http://localhost:7850/auth/
```

`http://localhost:4701` must be the backend's `INTERNAL_PORTAL_ORIGIN`.

## Build

```
npm run build:preprod   # API https://preconsole.ovationwps.com/auth/
npm run build           # API https://console.ovationwps.com/auth/
```

Output is in `dist/customer-portal`. Deploy it as its own IIS site; `web.config` is included.

## Going live on a new domain

1. Backend `.env`: set `PORTAL_ORIGIN` to the portal's exact origin, e.g.
   `PORTAL_ORIGIN=https://portal.example.com`. Several origins can be comma-separated. CORS
   and the token check both read it, so there is no need to edit `CORS_ALLOWED_ORIGINS`.
   Restart the API.
2. If the API host differs from `console` / `preconsole`, change `apiUrl` in
   `src/environments/*` and `connect-src` in `src/web.config`.
3. Bind the IIS site to the domain with a TLS certificate. `web.config` redirects HTTP to HTTPS.
