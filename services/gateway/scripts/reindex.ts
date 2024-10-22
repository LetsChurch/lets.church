import { input, select, confirm } from '@inquirer/prompts';
import ora from 'ora';
import pMap from 'p-map';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { emptySignal } from '../src/temporal/signals';
import { indexDocumentWorkflow } from '../src/temporal/workflows';
import prisma from '../src/util/prisma';
import logger from '../src/util/logger';

const what = await select({
  message: 'What would you like to reindex?',
  choices: [
    {
      name: 'Uploads and Transcript',
      value: 'uploads-and-transcripts' as const,
    },
    { name: 'Uploads', value: 'uploads' as const },
    { name: 'Transcripts', value: 'transcripts' as const },
    { name: 'Channels', value: 'channels' as const },
    { name: 'Organizations', value: 'organizations' as const },
  ],
});

const scope =
  what === 'uploads' ||
  what === 'transcripts' ||
  what === 'uploads-and-transcripts'
    ? await select({
        message: 'What scope would you like to reindex?',
        choices: [
          { name: 'Channel Slugs', value: 'slugs' as const },
          { name: 'Date range', value: 'date' as const },
          { name: 'All', value: 'all' as const },
        ],
      })
    : null;

const slugs =
  scope === 'slugs'
    ? (await input({ message: 'Slugs (comma-seperated):' })).split(',')
    : null;

const dateStart =
  scope === 'date' ? await input({ message: 'Start date:' }) : null;
const dateEnd =
  scope === 'date' ? await input({ message: 'Start date:' }) : null;

const documents = await (what === 'organizations'
  ? prisma.organization.findMany({
      select: { id: true },
      take: Number.MAX_SAFE_INTEGER,
    })
  : what === 'channels'
  ? prisma.channel.findMany({
      select: { id: true },
      take: Number.MAX_SAFE_INTEGER,
    })
  : prisma.uploadRecord.findMany({
      select: { id: true },
      take: Number.MAX_SAFE_INTEGER,
      where: {
        transcodingFinishedAt: { not: null },
        transcribingFinishedAt: { not: null },
        ...(slugs
          ? {
              channel: {
                slug: { in: slugs },
              },
            }
          : {}),
        ...(dateStart && dateEnd
          ? {
              createdAt: {
                gte: new Date(dateStart),
                lte: new Date(dateEnd),
              },
            }
          : {}),
      },
    }));

if (
  !(await confirm({
    message: `Queue ${documents.length} documents for reindexing?`,
  }))
) {
  process.exit(0);
}

logger.info(`Queueing documents from ${documents.length} documents`);

const total = documents.length;
let queued = 0;

const spinner = ora(`Queueing ${total} documents`).start();

await pMap(
  documents,
  async ({ id }) => {
    if (what === 'transcripts' || what === 'uploads-and-transcripts') {
      await (
        await client
      ).workflow.signalWithStart(indexDocumentWorkflow, {
        taskQueue: BACKGROUND_QUEUE,
        workflowId: `reindexTranscript:${id}`,
        args: ['transcript', id, `${id}/transcript.vtt`],
        signal: emptySignal,
        signalArgs: [],
      });

      await (
        await client
      ).workflow.signalWithStart(indexDocumentWorkflow, {
        taskQueue: BACKGROUND_QUEUE,
        workflowId: `reindexTranscriptHtml:${id}`,
        args: ['transcriptHtml', id, `${id}/transcript.original.json`],
        signal: emptySignal,
        signalArgs: [],
      });
    }

    if (what === 'uploads' || what === 'uploads-and-transcripts') {
      await (
        await client
      ).workflow.signalWithStart(indexDocumentWorkflow, {
        taskQueue: BACKGROUND_QUEUE,
        workflowId: `reindexUpload:${id}`,
        args: ['upload', id],
        signal: emptySignal,
        signalArgs: [],
      });
    }

    if (what === 'channels') {
      await (
        await client
      ).workflow.signalWithStart(indexDocumentWorkflow, {
        taskQueue: BACKGROUND_QUEUE,
        workflowId: `reindexChannel:${id}`,
        args: ['channel', id],
        signal: emptySignal,
        signalArgs: [],
      });
    }

    if (what === 'organizations') {
      await (
        await client
      ).workflow.signalWithStart(indexDocumentWorkflow, {
        taskQueue: BACKGROUND_QUEUE,
        workflowId: `reindexOrganization:${id}`,
        args: ['organization', id],
        signal: emptySignal,
        signalArgs: [],
      });
    }

    queued += 1;
    spinner.text = `Queued ${queued}/${total} uploads`;
  },
  { concurrency: 15 },
);

spinner.succeed('Done!');
