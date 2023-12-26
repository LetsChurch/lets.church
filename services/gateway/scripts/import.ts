import { readFile } from 'fs/promises';
import { input, confirm, editor } from '@inquirer/prompts';
import { z } from 'zod';
import PQueue from 'p-queue';
import { truncate } from 'lodash-es';
import { xxh32 } from '@node-rs/xxhash';
import prisma from '../src/util/prisma';
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

const skipDupes = await confirm({ message: 'Skip duplicates?', default: true });

if (
  !(await confirm({
    message: `Import ${data.length} records with provided details${
      skipDupes ? `, skipping duplicates` : ''
    }?`,
    default: false,
  }))
) {
  process.exit(0);
}

const c = await client;
const queue = new PQueue({ concurrency: 5 });

const importDate = new Date().toISOString();

let dupes = 0;

for (const input of data) {
  queue.add(async () => {
    if (skipDupes) {
      const count = await prisma.uploadRecord.count({
        where: {
          title: input.title,
          publishedAt: new Date(input.publishedAt),
          channel: { slug: common.channelSlug },
        },
      });

      if (count > 0) {
        dupes += 1;

        console.log(
          `Skipping duplicate from ${input.publishedAt}: ${input.title}`,
        );

        return;
      }
    }

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

if (skipDupes) {
  console.log(`Skipped ${dupes} duplicates`);
}
