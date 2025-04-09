import { mount, StartClient } from 'solid-start/entry-client';
import * as Sentry from '@sentry/browser';
import Plausible from 'plausible-tracker';
import posthog from 'posthog-js';

if (import.meta.env['MODE'] !== 'development') {
  Sentry.init({
    dsn: import.meta.env['VITE_SENTRY_DSN'],
    environment: import.meta.env['MODE'],
  });
}

const plausible = Plausible({
  domain: 'lets.church',
});

plausible.enableAutoPageviews();
plausible.enableAutoOutboundTracking();
plausible.trackEvent('supports', {
  props: {
    anchorPositioning: window.CSS.supports('anchor-name', '--anchor-el'),
  },
});

posthog.init('phc_nrdBwyxcJ3Tc0g1Gq1J5Gd2w1nmpx0IIK4HQBusIu6P', {
  api_host: 'https://us.i.posthog.com',
  persistence: 'memory',
  person_profiles: 'identified_only',
});

mount(() => <StartClient />, document);
