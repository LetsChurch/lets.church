import pFilter from 'p-filter';
import { client } from '@/temporal';

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
    const workflowId = `processMedia:${uploadKey}`;
    const handle = temporalClient.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return description.status.name === 'RUNNING';
  } catch {
    // Workflow doesn't exist or can't be accessed
    return false;
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
