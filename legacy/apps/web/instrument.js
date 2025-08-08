import * as Sentry from '@sentry/node';
import envariant from '@knpwrs/envariant';
// Ensure to call this before importing any other modules!
Sentry.init({
  dsn: envariant('SENTRY_DSN'),

  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
