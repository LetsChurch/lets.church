import { NativeConnection, Worker } from '@temporalio/worker';
import { URL } from 'node:url';
import path from 'node:path';
import envariant from '@knpwrs/envariant';
import * as activities from './activities';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

const workflowsPath = new URL(
  `./workflows/index${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

console.log({ workflowsPath });

const worker = await Worker.create({
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  // TODO: prebundle
  workflowsPath,
  activities,
  taskQueue: 'process-upload',
});

await worker.run();
