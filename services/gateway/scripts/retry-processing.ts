import { input, confirm, select } from '@inquirer/prompts';
import { z } from 'zod';
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
      { name: 'Everything failed', value: 'everything' },
    ],
  }),
);
const onlyFailed = await confirm({ message: 'Only failed?', default: true });

const ids: Array<string> = [];

if (scope === 'ids') {
  ids.push(
    ...(await input({ message: 'ids (comma-separated):' }))
      .split(/,/g)
      .map((s) => s.trim()),
  );
} else if (scope === 'slug') {
  const slug = await input({ message: 'Slug:' });

  ids.push(
    ...(
      await prisma.uploadRecord.findMany({
        select: { id: true },
        where: {
          channel: { slug },
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

let errorCount = 0;

for (const id of ids) {
  const { finalizedUploadKey } = await prisma.uploadRecord.findUniqueOrThrow({
    select: { finalizedUploadKey: true },
    where: { id },
  });

  if (!finalizedUploadKey) {
    console.log(`No finalizedUploadKey found for ${id}`);
    errorCount += 1;
    continue;
  }

  (await client).workflow.start(processMediaWorkflow, {
    args: [id, finalizedUploadKey, subScope],
    workflowId: `processMedia:${finalizedUploadKey}:retry${Date.now()}`,
    taskQueue: BACKGROUND_QUEUE,
    retry: {
      maximumAttempts: 5,
    },
  });
}

console.log(`${ids.length - errorCount} uploads queued for reprocessing!`);
