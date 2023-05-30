import path from 'node:path';
import envariant from '@knpwrs/envariant';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as importActivities from '../activities/import';
import { IMPORT_QUEUE } from '../queues';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

const workflowsPath = new URL(
  `../workflows/index${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const importWorker = await Worker.create({
  identity: `import-worker ${envariant('IDENTITY')}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  // TODO: prebundle
  workflowsPath,
  activities: importActivities,
  taskQueue: IMPORT_QUEUE,
  shutdownGraceTime: envariant('TEMPORAL_SHUTDOWN_GRACE_TIME'),
  maxConcurrentWorkflowTaskExecutions: 2,
  maxConcurrentActivityTaskExecutions: 2,
});

await importWorker.run();
