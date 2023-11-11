import { readFile } from 'fs/promises';
import { input } from '@inquirer/prompts';
import { z } from 'zod';
import PQueue from 'p-queue';
import glob from 'fast-glob';
import { xxh32 } from '@node-rs/xxhash';
import { client } from '../src/temporal';
import { importMediaWorkflow } from '../src/temporal/workflows/import-media';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import logger from '../src/util/logger';

const schema = z.array(
  z.object({
    url: z.string().url(),
    title: z.string(),
    publishedAt: z.string(),
    description: z.string(),
    userCommentsEnabled: z.boolean().default(true),
  }),
);

const files = await glob('*.new.json');

if (files.length === 0) {
  logger.info('No files to import!');
  process.exit(0);
}

const common = {
  username: await input({ message: 'Username:' }),
};

const queue = new PQueue({ concurrency: 5 });

const importDate = new Date().toISOString();

for (const file of files) {
  const channelSlug = file.replace('.new.json', '');
  const data = schema.parse(JSON.parse(await readFile(file, 'utf-8')));
  const c = await client;

  for (const datum of data) {
    queue.add(async () => {
      const url = new URL(datum.url);
      await c.workflow.start(importMediaWorkflow, {
        taskQueue: BACKGROUND_QUEUE,
        workflowId: `importMedia:${importDate}:${url.origin}:${xxh32(
          datum.url,
        )}`,
        args: [{ ...common, ...datum, channelSlug }],
        retry: { maximumAttempts: 5 },
      });
    });
  }
}

await queue.onEmpty();
