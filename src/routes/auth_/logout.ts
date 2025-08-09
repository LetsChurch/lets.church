import { redirect } from '@tanstack/react-router';
import {
  createServerFileRoute,
  deleteCookie,
} from '@tanstack/react-start/server';

export const ServerRoute = createServerFileRoute('/auth_/logout').methods({
  POST: async () => {
    deleteCookie('lc-session');
    return redirect({ to: '/' });
  },
});
