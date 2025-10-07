import { accountProcedures } from './procedures/account';
import { authProcedures } from './procedures/auth';
import { commonProcedures } from './procedures/common';
import { dashboardRouter } from './procedures/dashboard';
import { homeProcedures } from './procedures/home';
import { mediaProcedures } from './procedures/media';
import { router } from './trpc';

export const appRouter = router({
  dashboard: dashboardRouter,
  auth: authProcedures,
  account: accountProcedures,
  common: commonProcedures,
  home: homeProcedures,
  media: mediaProcedures,
});

export type AppRouter = typeof appRouter;
