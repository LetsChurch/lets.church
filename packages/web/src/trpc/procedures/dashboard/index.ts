import { router } from '../../trpc';
import { adminRouter } from './admin';
import { channelRouter } from './channels';
import { churchRouter } from './churches';
import { importSourcesRouter } from './import-sources';
import { liveStreamingRouter } from './live-streaming';
import { organizationRouter } from './organizations';

export const dashboardRouter = router({
  admin: adminRouter,
  channels: channelRouter,
  churches: churchRouter,
  importSources: importSourcesRouter,
  liveStreaming: liveStreamingRouter,
  organizations: organizationRouter,
});
