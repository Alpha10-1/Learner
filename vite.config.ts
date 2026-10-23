import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { contentPlugin } from './scripts/content-plugin.ts';

export default defineConfig({
  plugins: [
    preact(),
    // Unit tests don't need built content (and shouldn't fail because a lesson is mid-edit).
    process.env.VITEST ? null : contentPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false, // registered by hand in src/main.tsx (no inline script, no workbox-window)
      // The manifest and its icons are precached automatically; these are the other icons.
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Mastery Queue',
        short_name: 'Mastery',
        description: 'Your daily queue of short lessons.',
        lang: 'en-ZA',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fafaf9',
        theme_color: '#fafaf9',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // The shell plus the content index and public phase chunks (§6.2).
        globPatterns: ['**/*.{js,css,html}', 'content/*.json'],
        // Both folders hold content-hashed file names, so the URL alone identifies a version.
        dontCacheBustURLsMatching: /^(assets|content)\//,
        rollupFormat: 'iife', // classic worker script; the 'es' path trips a Vite 8 deprecation warning
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    alias: { 'virtual:mq-content': fileURLToPath(new URL('./tests/fixtures/virtual-content.ts', import.meta.url)) },
  },
});
