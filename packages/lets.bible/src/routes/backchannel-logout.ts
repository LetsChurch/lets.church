import { createFileRoute } from '@tanstack/react-router';

import { handleBackchannelLogout } from '@/server/oidc';

// Server-to-server endpoint for lets.church's OIDC back-channel logout. It
// takes no cookies and changes nothing without a logout token signed by
// lets.church, so it needs no CSRF protection.
export const Route = createFileRoute('/backchannel-logout')({
  component: () => null,
  server: {
    handlers: {
      POST: ({ request }) => handleBackchannelLogout(request),
    },
  },
});
