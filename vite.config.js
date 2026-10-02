import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// SPEC.md section 17: which build an error came from, in the ErrorLog -
// the commit in CI (GitHub Actions sets GITHUB_SHA), "dev" locally.
const APP_VERSION = process.env.GITHUB_SHA
  ? `${new Date().toISOString().slice(0, 10)}-${process.env.GITHUB_SHA.slice(0, 7)}`
  : 'dev';

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'logo-white.png'],
      manifest: {
        name: 'קטלוג הגלריה',
        short_name: 'קטלוג הגלריה',
        description: 'ניהול מלאי יצירות אמנות לגלריה',
        lang: 'he',
        dir: 'rtl',
        start_url: './',
        display: 'standalone',
        // SPEC.md 25.5: the catalog cover's black
        background_color: '#0E0E0D',
        theme_color: '#0E0E0D',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // woff2: the share card's fonts, so it's drawn offline too (SPEC.md 23.5)
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      },
    }),
  ],
})
