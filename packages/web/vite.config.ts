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
    nitroV2Plugin({ preset: 'node-server' }),
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
