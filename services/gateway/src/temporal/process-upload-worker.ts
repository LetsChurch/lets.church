import { NativeConnection, Worker } from '@temporalio/worker';
import { URL } from 'node:url';
import path from 'node:path';
import envariant from '@knpwrs/envariant';
import * as activities from './activities/process-upload';
import { PROCESS_UPLOAD_QUEUE } from './queues';
import { waitOnTemporal } from '.';
import os from 'os';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

await waitOnTemporal();

const workflowsPath = new URL(
  `./workflows/process-upload${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const worker = await Worker.create({
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  // TODO: prebundle
  workflowsPath,
  activities,
  taskQueue: PROCESS_UPLOAD_QUEUE,
  maxConcurrentActivityTaskExecutions: os.cpus().length,
});

await worker.run();
