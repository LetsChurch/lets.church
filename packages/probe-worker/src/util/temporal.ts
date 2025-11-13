import type { Prisma } from '@letschurch/db';
import logger from '@letschurch/util';
import { Client, Connection } from '@temporalio/client';
import PLazy from 'p-lazy';
import waitOn from 'wait-on';
import { z } from 'zod';
import {
  updateUploadRecordSignal,
  updateUploadRecordWorkflow,
} from '../temporal/workflows';

const moduleLogger = logger.child({ module: 'util/temporal' });

const { TEMPORAL_ADDRESS } = z
  .object({ TEMPORAL_ADDRESS: z.string() })
  .parse(process.env);

export const client = PLazy.from(async () => {
  await waitOnTemporal();

  return new Client({
    connection: await Connection.connect({
      address: TEMPORAL_ADDRESS,
    }),
  });
});

export async function waitOnTemporal() {
  moduleLogger.info('Waiting for Temporal');

  await waitOn({
    resources: [`tcp:${TEMPORAL_ADDRESS}`],
  });

  moduleLogger.info('Temporal is available!');
}

export async function updateUploadRecord(
  uploadRecordId: string,
  data: Prisma.UploadRecordUpdateArgs['data'],
) {
  return (await client).workflow.signalWithStart(updateUploadRecordWorkflow, {
    taskQueue: 'background',
    workflowId: `updateUploadRecord:${uploadRecordId}`,
    args: [uploadRecordId],
    signal: updateUploadRecordSignal,
    signalArgs: [data],
    retry: {
      maximumAttempts: 8,
    },
  });
}
