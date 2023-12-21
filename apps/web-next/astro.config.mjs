import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
import svgSprites, {
  serializeHtml,
} from 'vite-plugin-svg-sprite-components-core';
import { serialize as serializeSolid } from 'vite-plugin-svg-sprite-components-solid';
import solidJs from '@astrojs/solid-js';
import sentry from '@sentry/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [
    tailwind(),
    solidJs(),
    sentry({
      dsn: 'https://f6bcb75202aed62ea324d140dff4b716@o387306.ingest.sentry.io/4506431136595968',
      sourceMapsUploadOptions: {
        project: 'letschurch-astro',
        authToken: process.env.SENTRY_AUTH_TOKEN,
      },
    }),
  ],
  vite: {
    plugins: [svgSprites({ serializers: [serializeHtml, serializeSolid] })],
  },
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
});
