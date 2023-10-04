import pMap from 'p-map';
import prisma from '../src/util/prisma';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { restitchTranscriptWorkflow } from '../src/temporal/workflows';
import logger from '../src/util/logger';

const recs = await prisma.uploadRecord.findMany({
  select: { id: true },
  where: {
    finalizedUploadKey: { not: null },
    transcribingFinishedAt: { not: null },
  },
});

const ids: Array<string> = recs.map(({ id }) => id);

const tc = await client;

pMap(
  ids,
  async (id) => {
    await tc.workflow.start(restitchTranscriptWorkflow, {
      args: [id],
      workflowId: `restitchTranscript:${id}`,
      taskQueue: BACKGROUND_QUEUE,
      retry: {
        maximumAttempts: 5,
      },
    });
  },
  { concurrency: 10 },
);

logger.info(`${ids.length} uploads queued for restitching!`);
