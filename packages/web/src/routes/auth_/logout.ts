import { createFileRoute, redirect } from '@tanstack/react-router';
import { deleteCookie } from '@tanstack/react-start/server';

export const Route = createFileRoute('/auth_/logout')({
  component: () => null,
  server: {
    handlers: {
      POST: async () => {
        deleteCookie('lc-session');
        throw redirect({ to: '/' });
      },
    },
  },
});
