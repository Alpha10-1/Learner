import { render } from 'preact';
import { App } from './app';
import './styles.css';

const root = document.getElementById('app');
if (root) render(<App />, root);

// The service worker only exists in production builds (vite-plugin-pwa, injectManifest).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err: unknown) => {
      // Without a service worker the app still works online; it just won't open offline.
      console.warn('Service worker registration failed', err);
    });
  });
}
