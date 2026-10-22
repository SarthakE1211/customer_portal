import { environment } from '../../environments/environment';

declare const google: any;
let loading: Promise<any> | null = null;

/** Loads the Maps JavaScript API once, on first use, and resolves with the `google.maps` namespace. */
export function loadGoogleMaps(): Promise<any> {
  if (typeof google !== 'undefined' && google.maps) return Promise.resolve(google.maps);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const callback = '__cpMapsReady';
      (window as any)[callback] = () => resolve(google.maps);
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(environment.googleMapsApiKey)}`
        + `&callback=${callback}&loading=async&v=weekly`;
      script.async = true;
      script.onerror = () => { loading = null; reject(new Error('Google Maps failed to load')); };
      document.head.appendChild(script);
    });
  }
  return loading;
}
