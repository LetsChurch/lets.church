import { select } from '@inquirer/prompts';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { indexDocumentWorkflow } from '../src/temporal/workflows';
import prisma from '../src/util/prisma';

const what = await select({
  message: 'What would you like to reindex?',
  choices: [
    { name: 'Everything', value: 'all' },
    { name: 'Transcripts', value: 'transcripts' },
  ],
});

const selecting = await select({
  message: 'What would you like to select for reindexing?',
  choices: [{ name: 'Everything', value: 'all' }],
});

if ((what === 'all' || what === 'transcripts') && selecting === 'all') {
  const uploads = await prisma.uploadRecord.findMany({
    select: { id: true },
    take: Number.MAX_SAFE_INTEGER,
  });

  console.log(`Queueing ${uploads.length} transcripts for reindexing`);

  for (const { id } of uploads) {
    await (
      await client
    ).workflow.start(indexDocumentWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `reindexTranscript:${id}`,
      args: ['transcript', id, `${id}/transcript.vtt`],
    });
  }

  console.log('Done!');
} else {
  console.log('Invalid choice');
  process.exit(-1);
}
