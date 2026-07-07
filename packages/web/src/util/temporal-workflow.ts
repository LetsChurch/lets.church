import pFilter from 'p-filter';

import { client, makeProcessMediaWorkflowId } from '@/temporal';

type UploadWithKey = {
  finalizedUploadKey: string | null;
};

/**
 * Checks if a workflow is currently running for the given upload key
 */
async function isWorkflowRunning(
  uploadKey: string,
  temporalClient: Awaited<typeof client>,
): Promise<boolean> {
  try {
    const workflowId = makeProcessMediaWorkflowId(uploadKey);
    const handle = temporalClient.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return description.status.name === 'RUNNING';
  } catch (err) {
    // Only a genuinely missing workflow counts as "not running". Transient
    // Temporal outages / permission / RPC errors must NOT be reported as
    // "not running": callers (admin bulk-retry) would then reset processing
    // state and start duplicate workflows for uploads that are actually still
    // running. Fail closed by rethrowing anything that isn't not-found.
    //
    // Match by error name rather than `instanceof WorkflowNotFoundError`: a
    // value import of @temporalio/client makes the SSR bundler emit a broken
    // deep import (@temporalio/common/lib/errors) that crashes at runtime, so
    // this package must stay type-only here (temporalio/sdk-typescript#2098).
    if (err instanceof Error && err.name === 'WorkflowNotFoundError') {
      return false;
    }
    throw err;
  }
}

/**
 * Filters uploads to only include those with running workflows
 */
export async function filterUploadsWithActiveWorkflows<T extends UploadWithKey>(
  uploads: T[],
  concurrency = 25,
): Promise<T[]> {
  const temporalClient = await client;

  return pFilter(
    uploads,
    async (upload) => {
      if (!upload.finalizedUploadKey) {
        return false;
      }
      return isWorkflowRunning(upload.finalizedUploadKey, temporalClient);
    },
    { concurrency },
  );
}

/**
 * Filters uploads to only include those without running workflows
 */
export async function filterUploadsWithoutActiveWorkflows<
  T extends UploadWithKey,
>(uploads: T[], concurrency = 25): Promise<T[]> {
  const temporalClient = await client;

  return pFilter(
    uploads,
    async (upload) => {
      if (!upload.finalizedUploadKey) {
        return true; // Include uploads without a finalized key
      }
      const isRunning = await isWorkflowRunning(
        upload.finalizedUploadKey,
        temporalClient,
      );
      return !isRunning;
    },
    { concurrency },
  );
}
