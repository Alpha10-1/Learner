import { render } from 'preact';
import { App } from './app';
import './styles.css';

const root = document.getElementById('app');
if (root) render(<App />, root);

// The service worker only exists in production builds (vite-plugin-pwa, injectManifest).
// Registering after `load` keeps the precache downloads from competing with first paint.
function registerServiceWorker() {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err: unknown) => {
    // Without a service worker the app still works online; it just won't open offline.
    console.warn('Service worker registration failed', err);
  });
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  if (document.readyState === 'complete') registerServiceWorker();
  else window.addEventListener('load', registerServiceWorker, { once: true });
}
