import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
import svgSprites, {
  serializeHtml,
} from 'vite-plugin-svg-sprite-components-core';
import { serialize as serializeSolid } from 'vite-plugin-svg-sprite-components-solid';
import solidJs from '@astrojs/solid-js';
import sentry from '@sentry/astro';
import mdx from '@astrojs/mdx';

console.log('process.env.NODE_ENV', process.env.NODE_ENV);

// https://astro.build/config
export default defineConfig({
  integrations: [
    tailwind(),
    solidJs(),
    mdx(),
    sentry({
      enabled: process.env.NODE_ENV === 'production',
      dsn: 'https://f6bcb75202aed62ea324d140dff4b716@o387306.ingest.sentry.io/4506431136595968',
      sourceMapsUploadOptions: {
        project: 'letschurch-astro',
        authToken: process.env.SENTRY_AUTH_TOKEN,
      },
      autoInstrumentation: {
        // TODO: https://github.com/getsentry/sentry-javascript/issues/9985
        requestHandler: false,
      },
    }),
  ],
  vite: {
    plugins: [
      svgSprites({
        serializers: [serializeHtml, serializeSolid],
      }),
    ],
  },
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
});
