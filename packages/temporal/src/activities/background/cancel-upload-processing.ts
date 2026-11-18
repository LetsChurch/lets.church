import { db, UploadState } from '@letschurch/db';
import { Context, sleep } from '@temporalio/activity';
import { eq } from 'drizzle-orm';

import { client } from '../../client';
import logger from '../../util/logger';
import {
  makeBackupToGlacierWorkflowId,
  makeProcessMediaWorkflowId,
} from '../../workflow-ids';
import { findUploadRecord } from './get-finalized-upload-key';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/cancel-upload-processing',
});

const POLL_INTERVAL_MS = 2_000;
// Long enough for a cancelled workflow to wind down; short enough to stay well
// inside the activity's start-to-close timeout.
const WAIT_FOR_CLOSE_MS = 5 * 60_000;

/**
 * Workflow IDs that may be processing or backing up this upload: processMedia
 * and backupToGlacier as started on upload/import (keyed by the finalized
 * upload key), plus bulk-backup runs (keyed by each UploadState id).
 */
async function processingWorkflowIds(uploadRecordId: string) {
  const record = await findUploadRecord(uploadRecordId);
  const states = await db
    .select({ id: UploadState.id })
    .from(UploadState)
    .where(eq(UploadState.uploadRecordId, uploadRecordId));

  const key = record?.finalizedUploadKey;
  return [
    ...(key
      ? [makeProcessMediaWorkflowId(key), makeBackupToGlacierWorkflowId(key)]
      : []),
    ...states.map((s) => makeBackupToGlacierWorkflowId(s.id)),
  ];
}

function isNotFound(err: unknown) {
  return err instanceof Error && err.name === 'WorkflowNotFoundError';
}

/**
 * Cancel the upload's processing/backup workflows and wait (bounded) for them
 * to close, so they aren't still writing files while the upload is deleted.
 */
export async function cancelUploadProcessing(uploadRecordId: string) {
  const temporal = await client;
  const ids = await processingWorkflowIds(uploadRecordId);
  const deadline = Date.now() + WAIT_FOR_CLOSE_MS;

  const results = await Promise.allSettled(
    ids.map(async (workflowId) => {
      const handle = temporal.workflow.getHandle(workflowId);
      try {
        await handle.cancel();
        moduleLogger.info({ uploadRecordId, workflowId }, 'Cancelled workflow');
      } catch (err) {
        // Not found, or already closed: nothing to cancel. Anything else (e.g.
        // Temporal briefly unavailable) fails the activity so it's retried,
        // rather than "waiting" on a workflow that was never cancelled.
        if (isNotFound(err)) return;
        throw err;
      }

      while (Date.now() < deadline) {
        try {
          const { status } = await handle.describe();
          if (status.name !== 'RUNNING') return;
        } catch (err) {
          if (isNotFound(err)) return;
          throw err;
        }
        Context.current().heartbeat(workflowId);
        await sleep(POLL_INTERVAL_MS);
      }

      moduleLogger.warn(
        { uploadRecordId, workflowId },
        'Workflow still running after cancel; deleting anyway',
      );
    }),
  );
  // Settle every loop first so none keeps polling into a retry attempt.
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
}
