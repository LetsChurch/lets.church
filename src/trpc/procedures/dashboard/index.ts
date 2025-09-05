import { router } from '../../trpc';
import { channelRouter } from './channels';
import { churchRouter } from './churches';
import { organizationRouter } from './organizations';

export const dashboardRouter = router({
  channels: channelRouter,
  churches: churchRouter,
  organizations: organizationRouter,
});
