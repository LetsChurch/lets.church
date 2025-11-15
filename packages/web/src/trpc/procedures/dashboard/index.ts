import { router } from '../../trpc';
import { adminRouter } from './admin';
import { channelRouter } from './channels';
import { churchRouter } from './churches';
import { organizationRouter } from './organizations';

export const dashboardRouter = router({
  admin: adminRouter,
  channels: channelRouter,
  churches: churchRouter,
  organizations: organizationRouter,
});
