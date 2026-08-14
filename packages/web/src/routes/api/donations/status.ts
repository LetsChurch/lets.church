import { createFileRoute } from '@tanstack/react-router';

import { handleDonationStatusRequest } from './-status.server';

export const Route = createFileRoute('/api/donations/status')({
  component: () => null,
  server: {
    handlers: {
      GET: ({ request }) => handleDonationStatusRequest(request),
    },
  },
});
