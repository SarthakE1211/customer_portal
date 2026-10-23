// ng serve on http://localhost:4701, which is the backend's INTERNAL_PORTAL_ORIGIN.
export const environment = {
  production: false,
  version: '1.0.0',
  apiUrl: 'https://5d6zswg0-7850.inc1.devtunnels.ms/auth/',
  // Same browser key as the admin panel (Maps JavaScript API).
  googleMapsApiKey: 'AIzaSyBOL8XUOxJicHzlQRGi27Wdn5M3zazFKTU',
  // Same Entra ID app as the admin panel; add this site's origin as an SPA redirect URI.
  msal: { clientId: '6cccf11a-5ceb-4e57-8926-4946962bfe5e', tenantId: 'a76d9a44-07f4-4a91-92a4-f60789e4f1ba' }
};
