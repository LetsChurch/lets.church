import { select } from '@inquirer/prompts';
import ora from 'ora';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import {
  indexDocumentSignal,
  indexDocumentWorkflow,
} from '../src/temporal/workflows';
import prisma from '../src/util/prisma';

const what = await select({
  message: 'What would you like to reindex?',
  choices: [
    { name: 'Everything', value: 'all' },
    { name: 'Transcripts', value: 'transcripts' },
    { name: 'Uploads', value: 'uploads' },
  ],
});

const uploads = await prisma.uploadRecord.findMany({
  select: { id: true },
  take: Number.MAX_SAFE_INTEGER,
  where: {
    transcodingFinishedAt: { not: null },
    transcribingFinishedAt: { not: null },
  },
});

console.log(`Queueing documents from ${uploads.length} uploads`);

const total = uploads.length;
let queued = 0;

const spinner = ora(`Queueing ${total} uploads`).start();

for (const { id } of uploads) {
  if (what === 'transcripts' || what === 'all') {
    await (
      await client
    ).workflow.signalWithStart(indexDocumentWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `reindexTranscript:${id}`,
      args: ['transcript', id, `${id}/transcript.vtt`],
      signal: indexDocumentSignal,
      signalArgs: [],
    });
  }

  if (what === 'uploads' || what === 'all') {
    await (
      await client
    ).workflow.signalWithStart(indexDocumentWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `reindexUpload:${id}`,
      args: ['upload', id],
      signal: indexDocumentSignal,
      signalArgs: [],
    });
  }

  queued += 1;
  spinner.text = `Queued ${queued}/${total} uploads`;
}

spinner.succeed('Done!');
