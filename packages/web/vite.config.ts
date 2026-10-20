/// <reference types="vitest/config" />

import path from 'node:path';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

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

// Server-only packages kept out of the SSR bundle: native modules, and packages
// that read their own files at runtime (uglify-js via html-minifier, pino's
// transport workers). Vite's ssr.external leaves them as bare imports and
// Nitro's traceDeps copies them into .output/server/node_modules; Nitro v3
// bundles everything else. Nitro resolves and traces these from web's own
// node_modules, so any that are imported here only through a workspace package
// (pino via @letschurch/util, mjml/html-minifier via @letschurch/temporal) must
// also be declared in web's package.json. @temporalio/client is traced but not
// listed as external: src/temporal/index.ts loads it through createRequire,
// which the bundler can't see.
const serverExternals = [
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
  'stripe',
  'subtitle',
];

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
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart(),
    nitro({
      preset: 'node-server',
      routeRules: {
        '/**': { headers: securityHeaders },
        '/embed/**': { headers: embedSecurityHeaders },
      },
      traceDeps: [...serverExternals, '@temporalio/client'],
    }),
    viteReact(),
    tailwindcss(),
  ],
  ssr: {
    noExternal: ['@tanstack/react-start', '@tanstack/react-router'],
    external: serverExternals,
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
            configDir: path.join(import.meta.dirname, '.storybook'),
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
