/// <reference types="vitest/config" />

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import tailwindcss from '@tailwindcss/vite';
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

function prismaClientAliasPlugin(): Plugin {
  return {
    name: 'prisma-client-alias',
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (source === '@/generated/prisma/client') {
        // Use browser version for client, full version for SSR
        if (options.ssr) {
          return this.resolve(
            path.join(dirname, 'src/generated/prisma/client.ts'),
            importer,
            { skipSelf: true, ...options },
          );
        }
        // For browser builds, redirect to browser-safe version
        return this.resolve(
          path.join(dirname, 'src/generated/prisma/browser.ts'),
          importer,
          { skipSelf: true, ...options },
        );
      }
      // For enums, always use the enums file (safe for both client and SSR)
      if (source === '@/generated/prisma/enums') {
        return this.resolve(
          path.join(dirname, 'src/generated/prisma/enums.ts'),
          importer,
          { skipSelf: true, ...options },
        );
      }
      return null;
    },
  };
}

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig(({ isSsrBuild }) => ({
  server: {
    port: 3000,
  },
  plugins: [
    prismaClientAliasPlugin(),
    tsConfigPaths(),
    tanstackStart(),
    nitroV2Plugin({ preset: 'node-server' }),
    viteReact(),
    tailwindcss(),
  ],
  ssr: {
    noExternal: ['@tanstack/react-start', '@tanstack/react-router'],
    external: [
      '@prisma/client',
      '.prisma/client',
      '@node-rs/xxhash',
      'argon2',
      'sharp',
    ],
  },
  build: isSsrBuild
    ? {
        ssr: true,
        rollupOptions: {
          external: (id, _parentId, _isResolved) => {
            // Externalize all node_modules except specific packages we need to bundle
            if (id.includes('node_modules') && !id.includes('@tanstack')) {
              return true;
            }
            // Externalize Prisma
            // if (id.startsWith('@prisma')) {
            //   return true;
            // }
            // Externalize native node modules (.node files)
            // if (id.includes('.node') || id.endsWith('.node')) {
            //   return true;
            // }
            return false;
          },
        },
      }
    : {},
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
