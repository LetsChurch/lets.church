// @ts-check
import { defineConfig, envField } from 'astro/config';
import sentry from '@sentry/astro';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  build: {},
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),
    },
  },
  integrations: [
    sentry({
      enabled: import.meta.env.NODE_ENV === 'production',
      dsn: 'https://f6bcb75202aed62ea324d140dff4b716@o387306.ingest.sentry.io/4506431136595968',
      sourceMapsUploadOptions: {
        project: 'letschurch-astro',
        authToken: import.meta.env.SENTRY_AUTH_TOKEN,
      },
    }),
  ],
});
