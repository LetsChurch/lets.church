import path from 'node:path';
import { NativeConnection, Worker } from '@temporalio/worker';
import envariant from '@knpwrs/envariant';
import * as backgroundctivities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';
import { waitOnTemporal } from '..';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

await waitOnTemporal();

const workflowsPath = new URL(
  `../workflows/index${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const backgroundWorker = await Worker.create({
  identity: `background-worker ${envariant('IDENTITY')}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  // TODO: prebundle
  workflowsPath,
  activities: backgroundctivities,
  taskQueue: BACKGROUND_QUEUE,
  shutdownGraceTime: envariant('TEMPORAL_SHUTDOWN_GRACE_TIME'),
});

await backgroundWorker.run();
