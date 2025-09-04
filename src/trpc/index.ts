import { authProcedures } from './procedures/auth';
import { commonProcedures } from './procedures/common';
import { dashboardRouter } from './procedures/dashboard';
import { router } from './trpc';

export const appRouter = router({
  dashboard: dashboardRouter,
  auth: authProcedures,
  common: commonProcedures,
});

export type AppRouter = typeof appRouter;
