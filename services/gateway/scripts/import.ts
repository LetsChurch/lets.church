import { readFile } from 'fs/promises';
import { input, confirm } from '@inquirer/prompts';
import * as Z from 'zod';
import invariant from 'tiny-invariant';
import PQueue from 'p-queue';
import { client } from '../src/temporal';
import { importMediaWorkflow } from '../src/temporal/workflows/import-media';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';

const schema = Z.array(
  Z.object({
    url: Z.string().url(),
    title: Z.string(),
    publishedAt: Z.string(),
    description: Z.string(),
  }),
);

const filename = process.argv.at(-1);
invariant(filename, 'Missing filename');
const data = schema.parse(JSON.parse(await readFile(filename, 'utf-8')));

const common = {
  username: await input({ message: 'Username:' }),
  channelSlug: await input({ message: 'Channel slug:' }),
};

const c = await client;
const queue = new PQueue({ concurrency: 5 });

if (
  !(await confirm({
    message: 'Perform import with provided details?',
    default: false,
  }))
) {
  process.exit(0);
}

data.forEach((input) => {
  queue.add(async () => {
    await c.workflow.start(importMediaWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `importMedia:${input.url}`,
      args: [{ ...common, ...input }],
      retry: { maximumAttempts: 5 },
    });
  });
});

await queue.onEmpty();
