import { NativeConnection, Worker } from '@temporalio/worker';
import { URL } from 'node:url';
import path from 'node:path';
import envariant from '@knpwrs/envariant';
import waitOn from 'wait-on';
import * as activities from './activities';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

console.log('Waiting for Temporal');

await waitOn({
  resources: [`tcp:${TEMPORAL_ADDRESS}`],
});

console.log('Temporal is available!');

const workflowsPath = new URL(
  `./workflows/index${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const worker = await Worker.create({
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  // TODO: prebundle
  workflowsPath,
  activities,
  // TODO: split worker and set limits so indexing doesn't get blocked by transcoding
  taskQueue: 'background',
});

await worker.run();
