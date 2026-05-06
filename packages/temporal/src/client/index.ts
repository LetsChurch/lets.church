import type { UploadVariant } from '@letschurch/db';
import { Client, Connection, type WorkflowOptions } from '@temporalio/client';
import PLazy from 'p-lazy';
import waitOn from 'wait-on';
import { z } from 'zod';
import type { DocumentKind } from '../activities/background/index-document';
import { UPLOAD_ID_KEY } from '../search-attributes';
import { emptySignal } from '../signals';
import logger from '../util/logger';
import {
  makeCreateUploadRecordWorkflowId,
  makeIndexDocumentWorkflowId,
  makeRecordDownloadSizeWorkflowId,
  makeUpdateUploadRecordWorkflowId,
} from '../workflow-ids';
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

export type UploadRecordCreateData = {
  title?: string | null;
  description?: string | null;
  license?: string;
  visibility?: string;
  publishedAt?: Date | string;
  userCommentsEnabled?: boolean;
  uploadFinalized?: boolean;
  uploadFinalizedById?: string;
  appUserId?: string;
  channelId?: string;
  [key: string]: unknown;
};

export type UploadRecordUpdateData = {
  title?: string | null;
  description?: string | null;
  license?: string;
  visibility?: string;
  publishedAt?: Date;
  userCommentsEnabled?: boolean;
  transcodingStartedAt?: Date | null;
  transcodingFinishedAt?: Date | null;
  transcodingProgress?: number;
  transcribingStartedAt?: Date | null;
  transcribingFinishedAt?: Date | null;
  finalizedUploadKey?: string | null;
  uploadFinalizedAt?: Date | null;
  uploadFinalized?: boolean;
  uploadFinalizedById?: string | null;
  originalFileName?: string | null;
  probe?: unknown;
  variants?: string[];
  score?: number;
  scoreStaleAt?: Date | null;
  [key: string]: unknown;
};

export async function createUploadRecord(
  data: UploadRecordCreateData,
  importId?: string,
) {
  const res = await (await client).workflow.start(createUploadRecordWorkflow, {
    ...retryOps,
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeCreateUploadRecordWorkflowId(
      importId,
      data.publishedAt as Date,
      data.title as string,
    ),
    args: [data],
  });

  return res.result();
}

export async function updateUploadRecord(
  uploadRecordId: string,
  data: UploadRecordUpdateData,
) {
  return (await client).workflow.signalWithStart(updateUploadRecordWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeUpdateUploadRecordWorkflowId(uploadRecordId),
    args: [uploadRecordId],
    signal: updateUploadRecordSignal,
    signalArgs: [data],
    typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadRecordId }],
    retry: {
      maximumAttempts: 8,
    },
  });
}

export async function recordDownloadSize(
  uploadRecordId: string,
  variant: (typeof UploadVariant.enumValues)[number],
  bytes: number,
) {
  return (await client).workflow.start(recordDownloadSizeWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: makeRecordDownloadSizeWorkflowId(uploadRecordId, variant),
    args: [uploadRecordId, variant, bytes],
    typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadRecordId }],
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
    workflowId: makeIndexDocumentWorkflowId(kind, uploadId),
    args: [kind, uploadId, uploadKey],
    signal: emptySignal,
    signalArgs: [],
    typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadId }],
    retry: {
      maximumAttempts: 8,
    },
  });
}
