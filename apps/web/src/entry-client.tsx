import { mount, StartClient } from 'solid-start/entry-client';
import * as Sentry from '@sentry/browser';
import Plausible from 'plausible-tracker';

Sentry.init({
  dsn: import.meta.env['VITE_SENTRY_DSN'],
  environment: import.meta.env['MODE'],
});

const plausible = Plausible({
  domain: 'lets.church',
});

plausible.enableAutoPageviews();
plausible.enableAutoOutboundTracking();

mount(() => <StartClient />, document);
