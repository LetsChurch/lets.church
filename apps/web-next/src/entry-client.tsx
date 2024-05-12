// @refresh reload
import { mount, StartClient } from '@solidjs/start/client';
import { DEV } from 'solid-js';
import * as Sentry from '@sentry/browser';

// this will only initialize your Sentry client in production builds.
if (!DEV) {
  Sentry.init({
    dsn: import.meta.env['VITE_SENTRY_DSN'],
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,

    // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
    tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],

    // Capture Replay for 10% of all sessions,
    // plus 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

mount(() => <StartClient />, document.getElementById('app')!);
