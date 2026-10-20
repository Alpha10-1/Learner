// Service worker, built by vite-plugin-pwa (injectManifest) into dist/sw.js.
// M0: precache the app shell so the app opens offline after one online visit.
// Push, notification clicks, acks and the update flow arrive in M6 and M8.
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

cleanupOutdatedCaches();

// Routes are hash-based (#/today), so every navigation requests "/", which the precache
// serves from index.html (directoryIndex). No separate navigation route is needed.
precacheAndRoute(self.__WB_MANIFEST);
