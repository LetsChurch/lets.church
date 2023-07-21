import ora from 'ora';
import { client } from '../src/temporal';
import prisma from '../src/util/prisma';
import { remakeThumbnailsWorkflow } from '../src/temporal/workflows';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { emptySignal } from '../src/temporal/signals';
import { UploadVariant } from '@prisma/client';

const spinner = ora('Queueing videos for remaking thumbnails:').start();

const uploads = await prisma.uploadRecord.findMany({
  select: { id: true },
  take: Number.MAX_SAFE_INTEGER,
  where: {
    OR: [
      { variants: { has: UploadVariant.VIDEO_4K } },
      { variants: { has: UploadVariant.VIDEO_1080P } },
      { variants: { has: UploadVariant.VIDEO_720P } },
      { variants: { has: UploadVariant.VIDEO_480P } },
      { variants: { has: UploadVariant.VIDEO_360P } },
    ],
  },
});

for (const { id } of uploads) {
  await (
    await client
  ).workflow.signalWithStart(remakeThumbnailsWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `deleteUploadRecord:${id}`,
    args: [id],
    signal: emptySignal,
    signalArgs: [],
  });
}

spinner.succeed('Done!');
