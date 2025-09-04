import { router } from '../../trpc';
import { channelRouter } from './channels';
import { churchRouter } from './churches';

export const dashboardRouter = router({
  channels: channelRouter,
  churches: churchRouter,
});
