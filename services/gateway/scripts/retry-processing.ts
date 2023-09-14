import { readFile } from 'node:fs/promises';
import { input, confirm, select } from '@inquirer/prompts';
import { z } from 'zod';
import pMap from 'p-map';
import prisma from '../src/util/prisma';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { processMediaWorkflow } from '../src/temporal/workflows';

const scope = await select({
  message: 'What do you want to retry?',
  choices: [
    { name: 'List of IDs', value: 'ids' },
    { name: 'Channel Slug', value: 'slug' },
  ],
});

const subScope = z.enum(['transcode', 'transcribe', 'everything']).parse(
  await select({
    message: `What would you like to retry for?`,
    choices: [
      { name: 'Transcriptions', value: 'transcribe' },
      { name: 'Transcodings', value: 'transcode' },
      { name: 'Everything', value: 'everything' },
    ],
  }),
);
const onlyFailed = await confirm({ message: 'Only failed?', default: true });

const ids: Array<string> = [];

if (scope === 'ids') {
  const source = await select({
    message: 'IDs from:',
    choices: [
      { name: 'File', value: 'file' },
      { name: 'Input', value: 'input' },
    ],
  });
  if (source === 'file') {
    const filename = await input({ message: 'File name:' });
    const text = await readFile(filename, 'utf-8');
    ids.push(...text.trim().split(/\n/g));
  } else {
    ids.push(
      ...(await input({ message: 'ids (comma-separated):' }))
        .split(/,/g)
        .map((s) => s.trim()),
    );
  }
} else if (scope === 'slug') {
  const slug = await input({ message: 'Slug:' });

  ids.push(
    ...(
      await prisma.uploadRecord.findMany({
        select: { id: true },
        where: {
          channel: { slug },
          finalizedUploadKey: { not: null },
          ...(onlyFailed && subScope === 'transcribe'
            ? { transcribingFinishedAt: null }
            : {}),
          ...(onlyFailed && subScope === 'transcode'
            ? { transcodingFinishedAt: null }
            : {}),
          ...(onlyFailed && subScope === 'everything'
            ? {
                OR: [
                  { transcribingFinishedAt: null },
                  { transcodingFinishedAt: null },
                ],
              }
            : {}),
        },
      })
    ).map(({ id }) => id),
  );
} else {
  console.log('Invalid scope!');
  process.exit(-1);
}

if (ids.length === 0) {
  console.log('Nothing found to retry');
  process.exit(0);
}

if (
  !(await confirm({
    message: `Retry processing ${ids.length} uploads?`,
    default: false,
  }))
) {
  process.exit(0);
}

pMap(
  ids,
  async (id) => {
    (await client).workflow.start(processMediaWorkflow, {
      args: [id, null, subScope],
      workflowId: `processMedia:${id}:retry${Date.now()}`,
      taskQueue: BACKGROUND_QUEUE,
      retry: {
        maximumAttempts: 5,
      },
    });
  },
  { concurrency: 10 },
);

console.log(`${ids.length} uploads queued for reprocessing!`);
