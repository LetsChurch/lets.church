import { accountProcedures } from './procedures/account';
import { authProcedures } from './procedures/auth';
import { commonProcedures } from './procedures/common';
import { dashboardRouter } from './procedures/dashboard';
import { homeProcedures } from './procedures/home';
import { router } from './trpc';

export const appRouter = router({
  dashboard: dashboardRouter,
  auth: authProcedures,
  account: accountProcedures,
  common: commonProcedures,
  home: homeProcedures,
});

export type AppRouter = typeof appRouter;
