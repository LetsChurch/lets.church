/// <reference types="vitest/config" />

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import tailwindcss from '@tailwindcss/vite';
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import tsConfigPaths from 'vite-tsconfig-paths';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig((_config) => ({
  server: {
    port: 3000,
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    nitroV2Plugin({ preset: 'node-server' }),
    viteReact(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: path.join(dirname, '../db/src/generated/prisma/*.node'),
          dest: '.',
        },
      ],
    }),
  ],
  ssr: {
    noExternal: ['@tanstack/react-start', '@tanstack/react-router'],
    external: [
      '.prisma/client',
      '@letschurch/temporal',
      '@node-rs/xxhash',
      '@prisma/client',
      '@temporalio/activity',
      '@temporalio/client',
      '@temporalio/workflow',
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
            provider: 'playwright',
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
