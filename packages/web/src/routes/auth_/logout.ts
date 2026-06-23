import { AppSession, db } from '@letschurch/db';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { deleteCookie } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { getSession } from '@/util/auth';
import {
  clearSessionCookieOptions,
  SESSION_COOKIE,
} from '@/util/session-cookie';

export const Route = createFileRoute('/auth_/logout')({
  component: () => null,
  server: {
    handlers: {
      POST: async () => {
        // Revoke the server-side session, not just the cookie — otherwise a
        // previously captured lc-session JWT stays usable until expiry.
        const session = await getSession();
        if (session) {
          await db
            .update(AppSession)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(AppSession.id, session.id));
        }
        deleteCookie(SESSION_COOKIE, clearSessionCookieOptions);
        throw redirect({ to: '/' });
      },
    },
  },
});
