import type { Prisma, UploadVariant } from '@letschurch/db';
import { Client, Connection, type WorkflowOptions } from '@temporalio/client';
import PLazy from 'p-lazy';
import waitOn from 'wait-on';
import { z } from 'zod';
import type { DocumentKind } from '../activities/background/index-document';
import { emptySignal } from '../signals';
import logger from '../util/logger';
import {
  createUploadRecordWorkflow,
  indexDocumentWorkflow,
  recordDownloadSizeWorkflow,
  updateUploadRecordSignal,
  updateUploadRecordWorkflow,
} from '../workflows/background';

const moduleLogger = logger.child({ module: 'temporal' });

const { TEMPORAL_ADDRESS } = z
  .object({ TEMPORAL_ADDRESS: z.string() })
  .parse(process.env);

async function waitOnTemporal() {
  await waitOn({ resources: [`tcp:${TEMPORAL_ADDRESS}`] });
  moduleLogger.info('Temporal is ready');
}

export const client = PLazy.from(async () => {
  await waitOnTemporal();

  return new Client({
    connection: await Connection.connect({
      address: TEMPORAL_ADDRESS,
    }),
  });
});

const BACKGROUND_QUEUE = 'background';

const retryOps: Pick<WorkflowOptions, 'retry'> = {
  retry: { maximumAttempts: 5 },
};

export async function createUploadRecord(
  data: Prisma.UploadRecordCreateArgs['data'],
  importId?: string,
) {
  const res = await (await client).workflow.start(createUploadRecordWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `createUploadRecord:${
      importId ? `${importId}` : `${data.publishedAt}:${data.title}`
    }`,
    args: [data],
  });

  return res.result();
}

export async function updateUploadRecord(
  uploadRecordId: string,
  data: Prisma.UploadRecordUpdateArgs['data'],
) {
  return (await client).workflow.signalWithStart(updateUploadRecordWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `updateUploadRecord:${uploadRecordId}`,
    args: [uploadRecordId],
    signal: updateUploadRecordSignal,
    signalArgs: [data],
    retry: {
      maximumAttempts: 8,
    },
  });
}

export async function recordDownloadSize(
  uploadRecordId: string,
  variant: UploadVariant,
  bytes: number,
) {
  return (await client).workflow.start(recordDownloadSizeWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `recordDownloadSize:${uploadRecordId}:${variant}`,
    args: [uploadRecordId, variant, bytes],
    retry: {
      maximumAttempts: 5,
    },
  });
}

export async function indexDocument(
  kind: DocumentKind,
  uploadId: string,
  uploadKey?: string,
) {
  return (await client).workflow.signalWithStart(indexDocumentWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `${kind}:${uploadId}`,
    args: [kind, uploadId, uploadKey],
    signal: emptySignal,
    signalArgs: [],
    retry: {
      maximumAttempts: 8,
    },
  });
}
