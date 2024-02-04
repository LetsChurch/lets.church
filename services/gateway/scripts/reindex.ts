import { select } from '@inquirer/prompts';
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
  ],
});

const documents = await (what === 'channels'
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
      },
    }));

logger.info(`Queueing documents from ${documents.length} uploads`);

const total = documents.length;
let queued = 0;

const spinner = ora(`Queueing ${total} uploads`).start();

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

    queued += 1;
    spinner.text = `Queued ${queued}/${total} uploads`;
  },
  { concurrency: 15 },
);

spinner.succeed('Done!');
