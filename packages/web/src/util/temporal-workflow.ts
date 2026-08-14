import pFilter from 'p-filter';

import { client, makeProcessMediaWorkflowId } from '@/temporal';

import logger from './logger';

type UploadWithKey = {
  finalizedUploadKey: string | null;
};

// Temporal visibility queries are limited in both syntax terms and total
// length. Keep batches deliberately small so one processing-page request has a
// predictable number of visibility RPCs. A running execution is unique by
// workflow ID, so a page this size can contain every match for a batch.
export const WORKFLOW_VISIBILITY_QUERY_CHUNK_SIZE = 40;
const MAX_WORKFLOW_VISIBILITY_QUERY_LENGTH = 8_000;

const moduleLogger = logger.child({ module: 'util/temporal-workflow' });

function escapeVisibilityString(value: string): string {
  // Temporal's list-filter parser follows MySQL string rules: backslash is an
  // escape character and quote delimiters are doubled. Escape backslashes
  // first so neither character can terminate the generated literal.
  return value.replaceAll('\\', '\\\\').replaceAll("'", "''");
}

function runningWorkflowQuery(workflowIds: string[]): string {
  const workflowIdTerms = workflowIds.map(
    (workflowId) => `WorkflowId = '${escapeVisibilityString(workflowId)}'`,
  );
  const query = `(${workflowIdTerms.join(
    ' OR ',
  )}) AND ExecutionStatus = 'Running'`;

  if (query.length > MAX_WORKFLOW_VISIBILITY_QUERY_LENGTH) {
    throw new RangeError(
      'Workflow IDs exceed the safe Temporal visibility query length',
    );
  }

  return query;
}

async function runningWorkflowIds(workflowIds: string[]): Promise<Set<string>> {
  const startedAt = Date.now();
  const uniqueWorkflowIds = [...new Set(workflowIds)];
  const candidateIds = new Set(uniqueWorkflowIds);
  const runningIds = new Set<string>();
  let rpcCount = 0;

  try {
    const temporalClient = await client;
    for (
      let offset = 0;
      offset < uniqueWorkflowIds.length;
      offset += WORKFLOW_VISIBILITY_QUERY_CHUNK_SIZE
    ) {
      const chunk = uniqueWorkflowIds.slice(
        offset,
        offset + WORKFLOW_VISIBILITY_QUERY_CHUNK_SIZE,
      );
      const query = runningWorkflowQuery(chunk);
      rpcCount += 1;

      // Each exact-ID batch can return at most one running execution per ID.
      // Iterating to completion is still important: the SDK transparently
      // follows any server pagination rather than treating a partial page as
      // authoritative.
      for await (const execution of temporalClient.workflow.list({
        query,
        pageSize: WORKFLOW_VISIBILITY_QUERY_CHUNK_SIZE,
      })) {
        if (candidateIds.has(execution.workflowId)) {
          runningIds.add(execution.workflowId);
        }
      }
    }

    moduleLogger.info(
      {
        context: {
          candidateCount: uniqueWorkflowIds.length,
          chunkCount: rpcCount,
          rpcCount,
          durationMs: Date.now() - startedAt,
        },
      },
      'Filtered upload workflows with Temporal visibility',
    );

    return runningIds;
  } catch (error) {
    moduleLogger.error(
      {
        context: {
          candidateCount: uniqueWorkflowIds.length,
          chunkCount: rpcCount,
          rpcCount,
          durationMs: Date.now() - startedAt,
          errorClass:
            error instanceof Error
              ? error.name || error.constructor.name
              : typeof error,
        },
      },
      'Failed to filter upload workflows with Temporal visibility',
    );
    throw error;
  }
}

/**
 * Checks if a workflow is currently running for the given workflow ID
 */
async function isWorkflowRunning(
  workflowId: string,
  temporalClient: Awaited<typeof client>,
): Promise<boolean> {
  try {
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
): Promise<T[]> {
  const keyedUploads = uploads.flatMap((upload) =>
    upload.finalizedUploadKey
      ? [
          {
            upload,
            workflowId: makeProcessMediaWorkflowId(upload.finalizedUploadKey),
          },
        ]
      : [],
  );
  if (keyedUploads.length === 0) return [];

  const runningIds = await runningWorkflowIds(
    keyedUploads.map(({ workflowId }) => workflowId),
  );

  return keyedUploads
    .filter(({ workflowId }) => runningIds.has(workflowId))
    .map(({ upload }) => upload);
}

/**
 * Filters uploads to only include those without running workflows
 */
export async function filterUploadsWithoutActiveWorkflows<
  T extends UploadWithKey,
>(uploads: T[], concurrency = 25): Promise<T[]> {
  const temporalClient = await client;
  const lookups = new Map<string, Promise<boolean>>();

  return pFilter(
    uploads,
    async (upload) => {
      if (!upload.finalizedUploadKey) {
        return true; // Include uploads without a finalized key
      }

      const workflowId = makeProcessMediaWorkflowId(upload.finalizedUploadKey);
      let lookup = lookups.get(workflowId);
      if (!lookup) {
        // Visibility can lag workflow starts. Retry/bulk-mutation decisions
        // therefore retain strongly consistent describe calls and memoize
        // duplicate IDs only within this request.
        lookup = isWorkflowRunning(workflowId, temporalClient);
        lookups.set(workflowId, lookup);
      }
      return !(await lookup);
    },
    { concurrency },
  );
}
