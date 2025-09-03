import { router } from '../../trpc';
import { channelRouter } from './channels';
import { churchesProcedures } from './churches';

export const dashboardRouter = router({
  channels: channelRouter,
  churches: churchesProcedures,
});
