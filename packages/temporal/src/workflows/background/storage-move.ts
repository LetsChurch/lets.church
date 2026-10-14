import {
  CancellationScope,
  ContinueAsNew,
  condition,
  continueAsNew,
  isCancellation,
  ParentClosePolicy,
  proxyActivities,
  setCurrentDetails,
  setHandler,
  sleep,
  startChild,
} from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import type {
  MovedImageObject,
  RebalanceCursor,
  RebalanceGoal,
  StorageImageOwnerValue,
} from '../../activities/background/storage-move';
import { BACKGROUND_QUEUE, STORAGE_QUEUE } from '../../queues';
import {
  rebalanceCancelSignal,
  rebalancePauseSignal,
  rebalanceResumeSignal,
} from '../../refs';

const {
  beginRecordMove,
  flipRecordMove,
  abortRecordMove,
  cleanupRecordMoveSource,
  cleanupImageMoveSource,
  createRecordMove,
  measurePublicUsage,
  nextRebalanceBatch,
  rebalanceGoalBytes,
  setStorageMoveStatus,
  updateRebalanceProgress,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '2 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

// Copies can be large (multi-GB sources); they heartbeat per object/part
// and resume idempotently on retry.
const { copyPrefixBetweenLocations, moveOwnerImages } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '12 hours',
  heartbeatTimeout: '5 minutes',
  taskQueue: STORAGE_QUEUE,
  retry: { maximumAttempts: 10 },
});

/** Default wait before deleting a move's source objects. */
export const DEFAULT_MOVE_GRACE_SECONDS = 24 * 60 * 60;

export type MoveUploadRecordParams = {
  storageMoveId: string;
  uploadRecordId: string;
  // Seconds to keep the source after the flip, so open players, cached pages
  // and feeds that still reference the old CDN URLs keep working.
  graceSeconds?: number;
};

export type MoveUploadRecordResult =
  | { ok: true; targetLocation: string }
  | { ok: false; reason: string };

/**
 * Move one upload record's ingest + public objects to another location:
 * lock → copy (resumable) → flip in one transaction → schedule the source
 * cleanup after the grace period. Returns as soon as the flip lands; the
 * cleanup runs as an abandoned child so callers (processing relocation,
 * rebalance) don't wait out the grace period.
 */
export async function moveUploadRecordWorkflow({
  storageMoveId,
  uploadRecordId,
  graceSeconds = DEFAULT_MOVE_GRACE_SECONDS,
}: MoveUploadRecordParams): Promise<MoveUploadRecordResult> {
  setCurrentDetails('Starting move');
  const begin = await beginRecordMove(storageMoveId);
  if (!begin.ok) {
    await setStorageMoveStatus(storageMoveId, 'FAILED', {
      error: begin.reason,
    });
    return { ok: false, reason: begin.reason };
  }
  const { sourceLocation, targetLocation } = begin;

  try {
    setCurrentDetails(`Copying ${sourceLocation} → ${targetLocation}`);
    await Promise.all(
      (['INGEST', 'PUBLIC'] as const).map((kind) =>
        copyPrefixBetweenLocations({
          moveId: storageMoveId,
          kind,
          prefix: `${uploadRecordId}/`,
          sourceLocation,
          targetLocation,
        }),
      ),
    );
    setCurrentDetails('Switching to target');
    await flipRecordMove(storageMoveId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Roll back in a non-cancellable scope so a cancelled move still
    // releases its lock and removes partial copies.
    await CancellationScope.nonCancellable(() =>
      abortRecordMove(
        storageMoveId,
        message,
        isCancellation(err) ? 'CANCELLED' : 'FAILED',
      ),
    );
    if (isCancellation(err)) throw err;
    return { ok: false, reason: message };
  }

  await measurePublicUsage(uploadRecordId);

  await startChild(storageMoveCleanupWorkflow, {
    args: [{ storageMoveId, graceSeconds }],
    workflowId: `storageMoveCleanup:${storageMoveId}`,
    taskQueue: BACKGROUND_QUEUE,
    parentClosePolicy: ParentClosePolicy.ABANDON,
  });
  setCurrentDetails(`Moved to ${targetLocation}`);
  return { ok: true, targetLocation };
}

export type StorageMoveCleanupParams = {
  storageMoveId: string;
  graceSeconds: number;
  // Image moves pass the exact source objects to delete; record moves
  // delete the record's prefixes.
  imageObjects?: MovedImageObject[];
};

/** Wait out the grace period, then delete a finished move's source objects. */
export async function storageMoveCleanupWorkflow({
  storageMoveId,
  graceSeconds,
  imageObjects,
}: StorageMoveCleanupParams) {
  setCurrentDetails(`Grace period (${graceSeconds}s) before source cleanup`);
  if (graceSeconds > 0) {
    await sleep(graceSeconds * 1000);
  }
  setCurrentDetails('Deleting source objects');
  if (imageObjects) {
    await cleanupImageMoveSource(storageMoveId, imageObjects);
    return;
  }
  // Deferred while another move holds the record; re-check until it settles.
  while ((await cleanupRecordMoveSource(storageMoveId)) === 'deferred') {
    setCurrentDetails('Waiting for another move of this upload to finish');
    await sleep('10 minutes');
  }
}

export type MoveOwnerImagesParams = {
  storageMoveId: string;
  owner: StorageImageOwnerValue;
  ownerId: string;
  targetLocation: string;
  graceSeconds?: number;
};

/** Move one channel/org/user's images to another location. */
export async function moveOwnerImagesWorkflow({
  storageMoveId,
  owner,
  ownerId,
  targetLocation,
  graceSeconds = DEFAULT_MOVE_GRACE_SECONDS,
}: MoveOwnerImagesParams) {
  try {
    const moved = await moveOwnerImages({
      moveId: storageMoveId,
      owner,
      ownerId,
      targetLocation,
    });
    await startChild(storageMoveCleanupWorkflow, {
      args: [{ storageMoveId, graceSeconds, imageObjects: moved }],
      workflowId: `storageMoveCleanup:${storageMoveId}`,
      taskQueue: BACKGROUND_QUEUE,
      parentClosePolicy: ParentClosePolicy.ABANDON,
    });
  } catch (err) {
    await CancellationScope.nonCancellable(() =>
      setStorageMoveStatus(storageMoveId, 'FAILED', {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    throw err;
  }
}

export type RebalanceStorageParams = {
  storageMoveId: string;
  sourceLocation: string;
  // Null drains to whichever locations placement picks per record.
  targetLocation: string | null;
  goal: RebalanceGoal;
  concurrency: number;
  graceSeconds?: number;
  // Carried across continue-as-new.
  state?: {
    cursor: RebalanceCursor;
    goalBytes: string | null;
    movedBytes: string;
    started: number;
    paused: boolean;
  };
};

const REBALANCE_BATCH = 50;
// Bound workflow history: continue-as-new after this many record moves.
const MOVES_PER_RUN = 200;

/**
 * Move records off `sourceLocation` (largest first) until the goal is met,
 * running up to `concurrency` record moves at once. Pausable, resumable and
 * cancellable via signals; cancel stops starting new moves and lets the ones
 * in flight finish.
 */
export async function rebalanceStorageWorkflow(params: RebalanceStorageParams) {
  try {
    return await runRebalance(params);
  } catch (err) {
    // continue-as-new surfaces as a thrown ContinueAsNew; let it through.
    if (err instanceof ContinueAsNew) throw err;
    await CancellationScope.nonCancellable(() =>
      setStorageMoveStatus(params.storageMoveId, 'FAILED', {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    throw err;
  }
}

async function runRebalance(params: RebalanceStorageParams) {
  const {
    storageMoveId,
    sourceLocation,
    targetLocation,
    goal,
    graceSeconds = DEFAULT_MOVE_GRACE_SECONDS,
  } = params;
  const concurrency = Math.max(1, Math.min(params.concurrency, 16));

  let paused = params.state?.paused ?? false;
  let cancelled = false;
  setHandler(rebalancePauseSignal, () => {
    paused = true;
  });
  setHandler(rebalanceResumeSignal, () => {
    paused = false;
  });
  setHandler(rebalanceCancelSignal, () => {
    cancelled = true;
  });

  const goalBytesStr =
    params.state?.goalBytes !== undefined
      ? params.state.goalBytes
      : await rebalanceGoalBytes(sourceLocation, goal);
  const goalBytes = goalBytesStr === null ? null : BigInt(goalBytesStr);
  let movedBytes = BigInt(params.state?.movedBytes ?? '0');
  let cursor: RebalanceCursor = params.state?.cursor ?? null;
  let started = params.state?.started ?? 0;
  let startedThisRun = 0;
  let exhausted = false;

  if (!params.state) {
    await setStorageMoveStatus(storageMoveId, 'COPYING');
    if (goalBytes !== null) {
      await updateRebalanceProgress(storageMoveId, {
        totalBytes: String(goalBytes),
      });
    }
  }

  const inFlight = new Set<Promise<void>>();
  const goalMet = () => goalBytes !== null && movedBytes >= goalBytes;

  const runMove = async (record: { id: string; bytes: string }) => {
    const childMoveId = await createRecordMove({
      uploadRecordId: record.id,
      targetLocation,
      parentId: storageMoveId,
    });
    const child = await startChild(moveUploadRecordWorkflow, {
      args: [
        { storageMoveId: childMoveId, uploadRecordId: record.id, graceSeconds },
      ],
      workflowId: `storageMove:${childMoveId}`,
      taskQueue: BACKGROUND_QUEUE,
    });
    const result = await child.result();
    if (result.ok) {
      movedBytes += BigInt(record.bytes);
    }
  };

  while (!cancelled && !goalMet() && !exhausted) {
    if (paused) {
      await updateRebalanceProgress(storageMoveId, { status: 'PAUSED' });
      setCurrentDetails('Paused');
      await condition(() => !paused || cancelled);
      if (cancelled) break;
      await updateRebalanceProgress(storageMoveId, { status: 'COPYING' });
    }

    if (startedThisRun >= MOVES_PER_RUN) break;

    const batch = await nextRebalanceBatch({
      sourceLocation,
      cursor,
      limit: REBALANCE_BATCH,
    });
    cursor = batch.cursor;
    exhausted = batch.done;

    let plannedBytes = movedBytes;
    for (const record of batch.records) {
      if (cancelled || paused) break;
      if (goalBytes !== null && plannedBytes >= goalBytes) break;
      await condition(() => inFlight.size < concurrency || cancelled);
      if (cancelled) break;
      plannedBytes += BigInt(record.bytes);
      started += 1;
      startedThisRun += 1;
      setCurrentDetails(
        `Moving ${started} records (${movedBytes} bytes moved${goalBytes !== null ? ` of ${goalBytes}` : ''})`,
      );
      const p: Promise<void> = runMove(record).finally(() => {
        inFlight.delete(p);
      });
      inFlight.add(p);
    }
    await updateRebalanceProgress(storageMoveId, { totalItems: started });
  }

  await Promise.all(inFlight);

  if (
    !cancelled &&
    !goalMet() &&
    !exhausted &&
    startedThisRun >= MOVES_PER_RUN
  ) {
    return await continueAsNew<typeof rebalanceStorageWorkflow>({
      ...params,
      state: {
        cursor,
        goalBytes: goalBytesStr,
        movedBytes: String(movedBytes),
        started,
        paused,
      },
    });
  }

  if (cancelled) {
    await setStorageMoveStatus(storageMoveId, 'CANCELLED');
    setCurrentDetails('Cancelled');
    return;
  }
  if (goalBytes !== null && !goalMet()) {
    await setStorageMoveStatus(storageMoveId, 'COMPLETED', {
      error: `Ran out of movable records after ${movedBytes} of ${goalBytes} bytes`,
    });
    return;
  }
  await setStorageMoveStatus(storageMoveId, 'COMPLETED');
  setCurrentDetails('Completed');
}
