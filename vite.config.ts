import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Absolute, not './'. A service worker's scope is derived from where the
  // script is served, and a relative base makes that fragile - this is served
  // at the root of its own subdomain, so say so.
  base: '/',
  build: { target: 'es2022' },
  plugins: [
    VitePWA({
      // The game is a single bundle with no server state, so there is nothing
      // to lose by taking an update as soon as one exists.
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Blockout',
        short_name: 'Blockout',
        description: '3D Tetris - polycubes fall into a well, fill a layer to clear it.',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0e14',
        theme_color: '#0b0e14',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // Android crops icons to its own mask; without a maskable entry it
          // pads the square one into a smaller square on a white circle.
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the game needs is emitted at build time and fingerprinted,
        // so the whole thing can be precached and it runs offline outright -
        // no runtime caching rules, no network in the play path at all.
        globPatterns: ['**/*.{js,css,html,png,ico,webmanifest,wav}'],
      },
    }),
  ],
})
