import { readFile } from 'fs/promises';
import { input, confirm, editor } from '@inquirer/prompts';
import { z } from 'zod';
import PQueue from 'p-queue';
import { truncate } from 'lodash-es';
import { xxh32 } from '@node-rs/xxhash';
import { client } from '../src/temporal';
import { importMediaWorkflow } from '../src/temporal/workflows/import-media';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';

const schema = z.array(
  z.object({
    url: z.string().url(),
    title: z.string(),
    publishedAt: z.string(),
    description: z.string(),
    userCommentsEnabled: z.boolean().default(true),
  }),
);

const filename = process.argv.at(-1);
const data = filename?.endsWith('.json')
  ? schema.parse(JSON.parse(await readFile(filename, 'utf-8')))
  : [
      {
        url: await input({ message: 'url:' }),
        title: await input({ message: 'Title:' }),
        publishedAt: await input({ message: 'Published at:' }),
        description: await editor({ message: 'Description:' }),
        userCommentsEnabled: await confirm({
          message: 'User Comments enabled?',
          default: true,
        }),
      },
    ];

const common = {
  username: await input({ message: 'Username:' }),
  channelSlug: await input({ message: 'Channel slug:' }),
};

const c = await client;
const queue = new PQueue({ concurrency: 5 });

if (
  !(await confirm({
    message: `Import ${data.length} records with provided details?`,
    default: false,
  }))
) {
  process.exit(0);
}

const importDate = new Date().toISOString();

for (const input of data) {
  queue.add(async () => {
    const url = new URL(input.url);
    await c.workflow.start(importMediaWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: truncate(
        `importMedia:${importDate}:${url.origin}:${xxh32(input.url)}`,
        {
          length: 1000,
        },
      ),
      args: [{ ...common, ...input }],
      retry: { maximumAttempts: 5 },
    });
  });
}

await queue.onEmpty();
