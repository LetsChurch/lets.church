import { authProcedures } from './procedures/auth';
import { dashboardRouter } from './procedures/dashboard';
import { router } from './trpc';

export const appRouter = router({
  dashboard: dashboardRouter,
  auth: authProcedures,
});

export type AppRouter = typeof appRouter;
