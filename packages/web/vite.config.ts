/// <reference types="vitest/config" />

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import tailwindcss from '@tailwindcss/vite';
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// Security response headers applied to every route by Nitro's routeRules (only
// in the built server — the Vite dev server doesn't run Nitro, so localhost dev
// is unaffected and `upgrade-insecure-requests` never fights http://localhost).
//
// The CSP is intentionally a *hardening* policy (framing + injection surface),
// NOT a resource allow-list: we omit default-src/script-src/img-src/connect-src
// so we don't have to enumerate every external origin (Mux, Mapbox, the media
// CDN, image hosts) and risk breaking them. `frame-ancestors 'self'` supersedes
// X-Frame-Options in modern browsers, and is relaxed per-route for /embed/**.
//
// Permissions-Policy keeps the features the app actually uses enabled for its
// own origin — geolocation (proximity church search), autoplay/fullscreen/
// picture-in-picture (the media player) — and disables everything else.
const securityHeaders: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy':
    'accelerometer=(), autoplay=(self), camera=(), display-capture=(), encrypted-media=(self), fullscreen=(self), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(self), usb=()',
  'Content-Security-Policy':
    "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
};

// Embed routes are meant to be iframed by third-party sites. Widen
// frame-ancestors so browsers allow cross-origin framing; because a
// frame-ancestors directive is present, browsers ignore the inherited
// X-Frame-Options: SAMEORIGIN (CSP Level 2 supersedes X-Frame-Options).
const embedSecurityHeaders: Record<string, string> = {
  'Content-Security-Policy':
    "frame-ancestors *; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
};

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig((_config) => ({
  server: {
    port: 3000,
    // Allow the in-compose-network service hostname so other dev containers can
    // reach http://web:3000 without Vite's dev-server host check rejecting them —
    // e.g. the oidc-client example's back-channel calls and the mux-webhooks
    // forwarder POSTing to /webhooks/mux.
    allowedHosts: ['web'],
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    nitroV2Plugin({
      preset: 'node-server',
      routeRules: {
        '/**': { headers: securityHeaders },
        '/embed/**': { headers: embedSecurityHeaders },
      },
    }),
    viteReact(),
    tailwindcss(),
  ],
  ssr: {
    noExternal: ['@tanstack/react-start', '@tanstack/react-router'],
    external: [
      '@node-rs/xxhash',
      'argon2',
      'blurhash',
      'execa',
      'html-minifier',
      'mime',
      'mjml',
      'mkdirp',
      'nodemailer',
      'pino',
      'pino-pretty',
      'playwright',
      'rimraf',
      'sharp',
      'subtitle',
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
}));
