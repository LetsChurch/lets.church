import { createFileRoute, redirect } from '@tanstack/react-router';
import { deleteCookie } from '@tanstack/react-start/server';
import {
  clearSessionCookieOptions,
  SESSION_COOKIE,
} from '@/util/session-cookie';

export const Route = createFileRoute('/auth_/logout')({
  component: () => null,
  server: {
    handlers: {
      POST: async () => {
        deleteCookie(SESSION_COOKIE, clearSessionCookieOptions);
        throw redirect({ to: '/' });
      },
    },
  },
});
