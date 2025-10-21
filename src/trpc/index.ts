import { accountProcedures } from './procedures/account';
import { authProcedures } from './procedures/auth';
import { channelProcedures } from './procedures/channel';
import { commonProcedures } from './procedures/common';
import { dashboardRouter } from './procedures/dashboard';
import { homeProcedures } from './procedures/home';
import { libraryProcedures } from './procedures/library';
import { mediaProcedures } from './procedures/media';
import { router } from './trpc';

export const appRouter = router({
  dashboard: dashboardRouter,
  auth: authProcedures,
  account: accountProcedures,
  channel: channelProcedures,
  common: commonProcedures,
  home: homeProcedures,
  library: libraryProcedures,
  media: mediaProcedures,
});

export type AppRouter = typeof appRouter;
