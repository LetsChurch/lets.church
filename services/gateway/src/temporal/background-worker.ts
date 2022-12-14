import { NativeConnection, Worker } from '@temporalio/worker';
import { URL } from 'node:url';
import path from 'node:path';
import envariant from '@knpwrs/envariant';
import * as activities from './activities/background';
import { BACKGROUND_QUEUE } from './queues';
import { waitOnTemporal } from '.';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

await waitOnTemporal();

const workflowsPath = new URL(
  `./workflows/background/index${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const worker = await Worker.create({
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  // TODO: prebundle
  workflowsPath,
  activities,
  taskQueue: BACKGROUND_QUEUE,
  shutdownGraceTime: envariant('TEMPORAL_SHUTDOWN_GRACE_TIME'),
});

await worker.run();
