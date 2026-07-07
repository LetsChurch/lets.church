import tailwindcss from '@tailwindcss/vite';
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

// Security response headers applied to every route by Nitro's routeRules (only
// in the built server — the Vite dev server doesn't run Nitro, so localhost dev
// is unaffected and `upgrade-insecure-requests` never fights http://localhost).
//
// The CSP is intentionally a *hardening* policy (framing + injection surface),
// NOT a resource allow-list: we omit default-src/script-src/style-src/font-src
// so the Google Fonts the reader loads (fonts.googleapis.com / fonts.gstatic.com)
// keep working without enumeration. frame-ancestors 'self' supersedes
// X-Frame-Options in modern browsers. OIDC login is a plain server-side 302
// redirect (login.ts/callback.ts), never framed, so these headers don't touch it.
const securityHeaders: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy':
    'accelerometer=(), autoplay=(self), camera=(), display-capture=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(self), usb=()',
  'Content-Security-Policy':
    "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
};

export default defineConfig(() => ({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    // Precompress public assets (the large /reading/ + /search/ JSON) to .br/.gz
    // at build time; Nitro's static handler serves them with Content-Encoding when
    // the client allows it — e.g. BSB reading ~28.8MB raw → ~2.5MB brotli.
    nitroV2Plugin({
      preset: 'node-server',
      compressPublicAssets: { gzip: true, brotli: true },
      routeRules: {
        '/**': { headers: securityHeaders },
      },
    }),
    viteReact(),
    tailwindcss(),
  ],
}));
