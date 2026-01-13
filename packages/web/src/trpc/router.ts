import { accountProcedures } from './procedures/account';
import { authProcedures } from './procedures/auth';
import { channelProcedures } from './procedures/channel';
import { churchProcedures } from './procedures/church';
import { commonProcedures } from './procedures/common';
import { dashboardRouter } from './procedures/dashboard';
import { homeProcedures } from './procedures/home';
import { libraryProcedures } from './procedures/library';
import { listProcedures } from './procedures/list';
import { mediaProcedures } from './procedures/media';
import { newsletterProcedures } from './procedures/newsletter';
import { playlistProcedures } from './procedures/playlist';
import { searchProcedures } from './procedures/search';
import { seriesProcedures } from './procedures/series';
import { router } from './trpc';

export const appRouter = router({
  dashboard: dashboardRouter,
  auth: authProcedures,
  account: accountProcedures,
  channel: channelProcedures,
  church: churchProcedures,
  common: commonProcedures,
  home: homeProcedures,
  library: libraryProcedures,
  list: listProcedures,
  media: mediaProcedures,
  newsletter: newsletterProcedures,
  playlist: playlistProcedures,
  search: searchProcedures,
  series: seriesProcedures,
});

export type AppRouter = typeof appRouter;
