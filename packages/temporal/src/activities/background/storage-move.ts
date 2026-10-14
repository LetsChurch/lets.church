import {
  AppUser,
  Channel,
  db,
  Organization,
  StorageMove,
  UploadRecord,
  UploadState,
} from '@letschurch/db';
import { copyObjectBetween } from '@letschurch/s3/copy';
import { getLocation } from '@letschurch/s3/locations';
import { Context } from '@temporalio/activity';
import { and, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import pMap from 'p-map';

import { chooseLocation, fitsCaps } from '../../storage/placement';
import { getLocationCandidates, measurePrefixBytes } from '../../storage/usage';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'activities/background/storage-move',
});

const COPY_CONCURRENCY = 8;

type StorageMoveStatusValue = (typeof StorageMove.status.enumValues)[number];

export type StorageImageOwnerValue = 'APP_USER' | 'CHANNEL' | 'ORGANIZATION';

function heartbeat(detail?: unknown) {
  try {
    Context.current().heartbeat(detail);
  } catch {
    // Not running inside an activity (tests / scripts).
  }
}

function cancellationSignal(): AbortSignal | undefined {
  try {
    return Context.current().cancellationSignal;
  } catch {
    return undefined;
  }
}

export async function setStorageMoveStatus(
  moveId: string,
  status: StorageMoveStatusValue,
  extra: { error?: string | null } = {},
) {
  const terminal =
    status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
  await db
    .update(StorageMove)
    .set({
      status,
      ...(extra.error !== undefined ? { error: extra.error } : {}),
      ...(status === 'COPYING'
        ? { startedAt: sql`coalesce(${StorageMove.startedAt}, now())` }
        : {}),
      ...(terminal ? { finishedAt: new Date() } : {}),
    })
    .where(eq(StorageMove.id, moveId));
}

/** Create the storage_move row for a single upload-record move. */
export async function createRecordMove(params: {
  uploadRecordId: string;
  targetLocation: string | null;
  parentId?: string | null;
  triggeredById?: string | null;
  // Processing's own pre-transcode relocation: the record is mid-pipeline
  // by definition, so the "still processing" guard doesn't apply.
  reason?: 'capacity';
}): Promise<string> {
  const [record] = await db
    .select({ storageLocation: UploadRecord.storageLocation })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, params.uploadRecordId));
  if (!record) {
    throw new Error(`Upload record ${params.uploadRecordId} not found`);
  }
  const [row] = await db
    .insert(StorageMove)
    .values({
      kind: 'UPLOAD_RECORD',
      parentId: params.parentId ?? null,
      sourceLocation: record.storageLocation,
      targetLocation: params.targetLocation,
      uploadRecordId: params.uploadRecordId,
      goal: params.reason ? { reason: params.reason } : null,
      totalItems: 1,
      triggeredById: params.triggeredById ?? null,
    })
    .returning({ id: StorageMove.id });
  if (!row) throw new Error('Failed to create storage move');
  return row.id;
}

export type BeginRecordMoveResult =
  | {
      ok: true;
      sourceLocation: string;
      targetLocation: string;
      ingestBytes: string;
      publicBytes: string;
    }
  | { ok: false; reason: string };

/**
 * Validate and lock an upload record for a move. Resolves the target via
 * placement when none was given (drain), checks the target can hold
 * everything the record has, and takes the record's move lock. Re-running
 * for a move that already holds the lock resumes it.
 */
export async function beginRecordMove(
  moveId: string,
): Promise<BeginRecordMoveResult> {
  const [move] = await db
    .select()
    .from(StorageMove)
    .where(eq(StorageMove.id, moveId));
  if (!move?.uploadRecordId) {
    return { ok: false, reason: 'Move or upload record not found' };
  }
  const uploadRecordId = move.uploadRecordId;

  const [record] = await db
    .select({
      storageLocation: UploadRecord.storageLocation,
      storageMoveId: UploadRecord.storageMoveId,
      deletedAt: UploadRecord.deletedAt,
      uploadFinalized: UploadRecord.uploadFinalized,
      transcodingStartedAt: UploadRecord.transcodingStartedAt,
      transcodingFinishedAt: UploadRecord.transcodingFinishedAt,
      transcribingStartedAt: UploadRecord.transcribingStartedAt,
      transcribingFinishedAt: UploadRecord.transcribingFinishedAt,
    })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId));
  if (!record || record.deletedAt) {
    return { ok: false, reason: 'Upload record not found or deleted' };
  }
  if (record.storageMoveId && record.storageMoveId !== moveId) {
    return { ok: false, reason: 'Upload record is already being moved' };
  }
  const capacityRelocation =
    (move.goal as { reason?: string } | null)?.reason === 'capacity';
  if (record.storageMoveId !== moveId && !capacityRelocation) {
    // A multipart upload still landing in the source, or a transcode or
    // transcription still writing there, would strand objects at the source
    // after the flip. (Processing's own capacity relocation runs before
    // either starts.)
    if (!record.uploadFinalized) {
      return { ok: false, reason: 'Upload has not finished uploading' };
    }
    const running = (started: Date | null, finished: Date | null) =>
      started !== null && (finished === null || finished < started);
    if (
      running(record.transcodingStartedAt, record.transcodingFinishedAt) ||
      running(record.transcribingStartedAt, record.transcribingFinishedAt)
    ) {
      return { ok: false, reason: 'Upload is still processing' };
    }
  }

  const sourceLocation = record.storageLocation;
  const [ingest, pub] = await Promise.all([
    measurePrefixBytes(sourceLocation, 'INGEST', `${uploadRecordId}/`),
    measurePrefixBytes(sourceLocation, 'PUBLIC', `${uploadRecordId}/`),
  ]);
  const reservation = { ingestBytes: ingest.bytes, publicBytes: pub.bytes };

  let targetLocation = move.targetLocation;
  const candidates = await getLocationCandidates();
  if (!targetLocation) {
    // Drain: let placement choose among accepting locations.
    targetLocation =
      chooseLocation(candidates, {
        sourceBytes: ingest.bytes,
        reservation,
        exclude: [sourceLocation],
      })?.id ?? null;
    if (!targetLocation) {
      return { ok: false, reason: 'No location can hold this upload' };
    }
  } else {
    if (targetLocation === sourceLocation) {
      return { ok: false, reason: 'Upload is already at the target location' };
    }
    const target = candidates.find((c) => c.id === targetLocation);
    if (!target?.complete) {
      return {
        ok: false,
        reason: `Unknown or incomplete location ${targetLocation}`,
      };
    }
    // Admin moves may target a location that isn't accepting new uploads,
    // but never past its caps.
    if (!fitsCaps(target, reservation)) {
      return {
        ok: false,
        reason: `Location ${targetLocation} is over capacity`,
      };
    }
  }

  const locked = await db
    .update(UploadRecord)
    .set({ storageMoveId: moveId })
    .where(
      and(
        eq(UploadRecord.id, uploadRecordId),
        or(
          isNull(UploadRecord.storageMoveId),
          eq(UploadRecord.storageMoveId, moveId),
        ),
        eq(UploadRecord.storageLocation, sourceLocation),
      ),
    )
    .returning({ id: UploadRecord.id });
  if (locked.length === 0) {
    return {
      ok: false,
      reason: 'Upload record changed while starting the move',
    };
  }

  await db
    .update(StorageMove)
    .set({
      sourceLocation,
      targetLocation,
      totalBytes: ingest.bytes + pub.bytes,
      status: 'COPYING',
      startedAt: sql`coalesce(${StorageMove.startedAt}, now())`,
    })
    .where(eq(StorageMove.id, moveId));

  return {
    ok: true,
    sourceLocation,
    targetLocation,
    ingestBytes: String(ingest.bytes),
    publicBytes: String(pub.bytes),
  };
}

/**
 * Copy every object under `prefix` in one bucket kind from the source to the
 * target location. Idempotent (same-size objects are skipped), so a retried
 * activity resumes without re-transferring finished objects.
 */
export async function copyPrefixBetweenLocations(params: {
  moveId: string;
  kind: 'INGEST' | 'PUBLIC';
  prefix: string;
  sourceLocation: string;
  targetLocation: string;
}): Promise<{ objects: number; bytes: string; skipped: number }> {
  const source = getLocation(params.sourceLocation).bucket(params.kind);
  const target = getLocation(params.targetLocation).bucket(params.kind);
  const signal = cancellationSignal();

  const keys: string[] = [];
  for await (const key of source.listKeys(params.prefix)) {
    keys.push(key);
  }

  let bytes = 0n;
  let skipped = 0;
  let pending = 0n;
  const flush = async () => {
    if (pending === 0n) return;
    const delta = pending;
    pending = 0n;
    await db
      .update(StorageMove)
      .set({ copiedBytes: sql`${StorageMove.copiedBytes} + ${String(delta)}` })
      .where(eq(StorageMove.id, params.moveId));
  };

  await pMap(
    keys,
    async (key, i) => {
      const result = await copyObjectBetween(source, target, key, {
        signal,
        heartbeat: (detail) => heartbeat(detail),
      });
      bytes += BigInt(result.bytes);
      pending += BigInt(result.bytes);
      if (result.skipped) skipped += 1;
      heartbeat(`${params.kind} ${i + 1}/${keys.length}`);
      if (i % 50 === 0) await flush();
    },
    { concurrency: COPY_CONCURRENCY, signal },
  );
  await flush();

  return { objects: keys.length, bytes: String(bytes), skipped };
}

/**
 * Atomically point the record (and its tracked source objects) at the
 * target location and release the lock. New page loads build URLs from the
 * target immediately; the source stays put until the grace-period cleanup.
 */
export async function flipRecordMove(moveId: string) {
  await db.transaction(async (tx) => {
    const [move] = await tx
      .select()
      .from(StorageMove)
      .where(eq(StorageMove.id, moveId));
    if (!move?.uploadRecordId || !move.targetLocation) {
      throw new Error(`Storage move ${moveId} is missing its record or target`);
    }
    const targetBucket = getLocation(move.targetLocation).ingest.getBucket();

    const flipped = await tx
      .update(UploadRecord)
      .set({ storageLocation: move.targetLocation, storageMoveId: null })
      .where(
        and(
          eq(UploadRecord.id, move.uploadRecordId),
          eq(UploadRecord.storageMoveId, moveId),
        ),
      )
      .returning({ id: UploadRecord.id });
    if (flipped.length === 0) {
      throw new Error(`Upload record no longer locked by move ${moveId}`);
    }

    await tx
      .update(UploadState)
      .set({ storageLocation: move.targetLocation, s3Bucket: targetBucket })
      .where(eq(UploadState.uploadRecordId, move.uploadRecordId));

    await tx
      .update(StorageMove)
      .set({ status: 'GRACE', completedItems: 1 })
      .where(eq(StorageMove.id, moveId));

    // A rebalance counts a record as moved once it serves from the target;
    // the source cleanup that follows the grace period isn't progress.
    if (move.parentId) {
      await tx
        .update(StorageMove)
        .set({
          completedItems: sql`${StorageMove.completedItems} + 1`,
          copiedBytes: sql`${StorageMove.copiedBytes} + ${String(move.totalBytes)}`,
        })
        .where(eq(StorageMove.id, move.parentId));
    }
  });
}

/**
 * Undo a failed/cancelled record move: delete whatever reached the target
 * (only if the record still lives at the source) and release the lock.
 */
export async function abortRecordMove(
  moveId: string,
  error: string,
  status: 'FAILED' | 'CANCELLED' = 'FAILED',
) {
  const [move] = await db
    .select()
    .from(StorageMove)
    .where(eq(StorageMove.id, moveId));
  if (!move?.uploadRecordId) return;

  const [record] = await db
    .select({ storageLocation: UploadRecord.storageLocation })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, move.uploadRecordId));

  if (
    move.targetLocation &&
    record &&
    record.storageLocation !== move.targetLocation
  ) {
    const target = getLocation(move.targetLocation);
    await target.ingest.deletePrefix(`${move.uploadRecordId}/`, heartbeat);
    await target.public.deletePrefix(`${move.uploadRecordId}/`, heartbeat);
  }

  await db
    .update(UploadRecord)
    .set({ storageMoveId: null })
    .where(
      and(
        eq(UploadRecord.id, move.uploadRecordId),
        eq(UploadRecord.storageMoveId, moveId),
      ),
    );
  await setStorageMoveStatus(moveId, status, { error });
  if (move.parentId) {
    await db
      .update(StorageMove)
      .set({ failedItems: sql`${StorageMove.failedItems} + 1` })
      .where(eq(StorageMove.id, move.parentId));
  }
}

/**
 * After the grace period: delete the moved record's objects from the source
 * location — unless the record has since moved back there.
 */
export async function cleanupRecordMoveSource(
  moveId: string,
): Promise<'done' | 'deferred'> {
  const [move] = await db
    .select()
    .from(StorageMove)
    .where(eq(StorageMove.id, moveId));
  if (!move?.uploadRecordId) return 'done';

  const [record] = await db
    .select({
      storageLocation: UploadRecord.storageLocation,
      storageMoveId: UploadRecord.storageMoveId,
    })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, move.uploadRecordId));

  // Another move is copying this record right now, possibly back into this
  // move's source. Deleting the source prefix mid-copy would strand that
  // move, so wait for it to flip or roll back.
  if (record?.storageMoveId) {
    return 'deferred';
  }

  await setStorageMoveStatus(moveId, 'CLEANING');

  if (record?.storageLocation === move.sourceLocation) {
    moduleLogger.warn(
      { uploadId: move.uploadRecordId, context: { moveId } },
      'Record lives at the move source again; skipping source cleanup',
    );
  } else {
    const source = getLocation(move.sourceLocation);
    await source.ingest.deletePrefix(`${move.uploadRecordId}/`, heartbeat);
    await source.public.deletePrefix(`${move.uploadRecordId}/`, heartbeat);
  }

  await setStorageMoveStatus(moveId, 'COMPLETED');
  return 'done';
}

// --- Images ----------------------------------------------------------------

type ImageColumn = { path: string; location: string; column: string };

async function ownerImages(
  owner: StorageImageOwnerValue,
  ownerId: string,
): Promise<ImageColumn[]> {
  const out: ImageColumn[] = [];
  const push = (
    column: string,
    path: string | null,
    location: string | null,
  ) => {
    if (path && location) out.push({ column, path, location });
  };
  if (owner === 'APP_USER') {
    const [row] = await db
      .select({
        avatarPath: AppUser.avatarPath,
        avatarLocation: AppUser.avatarLocation,
      })
      .from(AppUser)
      .where(eq(AppUser.id, ownerId));
    if (row) push('avatar', row.avatarPath, row.avatarLocation);
  } else if (owner === 'CHANNEL') {
    const [row] = await db
      .select({
        avatarPath: Channel.avatarPath,
        avatarLocation: Channel.avatarLocation,
        coverPath: Channel.coverPath,
        coverLocation: Channel.coverLocation,
        defaultThumbnailPath: Channel.defaultThumbnailPath,
        defaultThumbnailLocation: Channel.defaultThumbnailLocation,
      })
      .from(Channel)
      .where(eq(Channel.id, ownerId));
    if (row) {
      push('avatar', row.avatarPath, row.avatarLocation);
      push('cover', row.coverPath, row.coverLocation);
      push(
        'defaultThumbnail',
        row.defaultThumbnailPath,
        row.defaultThumbnailLocation,
      );
    }
  } else {
    const [row] = await db
      .select({
        avatarPath: Organization.avatarPath,
        avatarLocation: Organization.avatarLocation,
        coverPath: Organization.coverPath,
        coverLocation: Organization.coverLocation,
      })
      .from(Organization)
      .where(eq(Organization.id, ownerId));
    if (row) {
      push('avatar', row.avatarPath, row.avatarLocation);
      push('cover', row.coverPath, row.coverLocation);
    }
  }
  return out;
}

async function setImageLocation(
  owner: StorageImageOwnerValue,
  ownerId: string,
  column: string,
  path: string,
  location: string,
): Promise<boolean> {
  // Compare-and-set on the path so a concurrent re-upload isn't clobbered.
  let rows: Array<{ id: string }> = [];
  if (owner === 'APP_USER') {
    rows = await db
      .update(AppUser)
      .set({ avatarLocation: location })
      .where(and(eq(AppUser.id, ownerId), eq(AppUser.avatarPath, path)))
      .returning({ id: AppUser.id });
  } else if (owner === 'CHANNEL') {
    const set =
      column === 'avatar'
        ? { avatarLocation: location }
        : column === 'cover'
          ? { coverLocation: location }
          : { defaultThumbnailLocation: location };
    const pathCol =
      column === 'avatar'
        ? Channel.avatarPath
        : column === 'cover'
          ? Channel.coverPath
          : Channel.defaultThumbnailPath;
    rows = await db
      .update(Channel)
      .set(set)
      .where(and(eq(Channel.id, ownerId), eq(pathCol, path)))
      .returning({ id: Channel.id });
  } else {
    const set =
      column === 'avatar'
        ? { avatarLocation: location }
        : { coverLocation: location };
    const pathCol =
      column === 'avatar' ? Organization.avatarPath : Organization.coverPath;
    rows = await db
      .update(Organization)
      .set(set)
      .where(and(eq(Organization.id, ownerId), eq(pathCol, path)))
      .returning({ id: Organization.id });
  }
  return rows.length > 0;
}

function ownerStateFilter(owner: StorageImageOwnerValue, ownerId: string): SQL {
  if (owner === 'APP_USER') return eq(UploadState.appUserId, ownerId);
  if (owner === 'CHANNEL') return eq(UploadState.channelId, ownerId);
  return eq(UploadState.organizationId, ownerId);
}

export type MovedImageObject = {
  kind: 'INGEST' | 'PUBLIC';
  key: string;
  location: string;
};

/**
 * Copy one owner's images (processed public images + their ingest
 * originals) to `targetLocation` and repoint them. Returns the source
 * objects to delete after the grace period.
 */
export async function moveOwnerImages(params: {
  moveId: string;
  owner: StorageImageOwnerValue;
  ownerId: string;
  targetLocation: string;
}): Promise<MovedImageObject[]> {
  const { moveId, owner, ownerId, targetLocation } = params;
  const target = getLocation(targetLocation);
  const moved: MovedImageObject[] = [];
  const signal = cancellationSignal();
  await setStorageMoveStatus(moveId, 'COPYING');

  for (const image of await ownerImages(owner, ownerId)) {
    if (image.location === targetLocation) continue;
    const result = await copyObjectBetween(
      getLocation(image.location).public,
      target.public,
      image.path,
      { signal, heartbeat },
    );
    if (
      await setImageLocation(
        owner,
        ownerId,
        image.column,
        image.path,
        targetLocation,
      )
    ) {
      moved.push({ kind: 'PUBLIC', key: image.path, location: image.location });
    } else {
      // The image changed underneath us; drop the orphaned copy.
      await target.public.deleteFile(image.path);
    }
    await db
      .update(StorageMove)
      .set({
        copiedBytes: sql`${StorageMove.copiedBytes} + ${String(result.bytes)}`,
      })
      .where(eq(StorageMove.id, moveId));
  }

  const originals = await db
    .select({
      id: UploadState.id,
      s3Key: UploadState.s3Key,
      storageLocation: UploadState.storageLocation,
    })
    .from(UploadState)
    .where(
      and(
        ownerStateFilter(owner, ownerId),
        isNull(UploadState.uploadRecordId),
        sql`${UploadState.storageLocation} <> ${targetLocation}`,
      ),
    );
  for (const original of originals) {
    const source = getLocation(original.storageLocation).ingest;
    if (!(await source.headObjectIfExists(original.s3Key))) continue;
    await copyObjectBetween(source, target.ingest, original.s3Key, {
      signal,
      heartbeat,
    });
    await db
      .update(UploadState)
      .set({
        storageLocation: targetLocation,
        s3Bucket: target.ingest.getBucket(),
      })
      .where(eq(UploadState.id, original.id));
    moved.push({
      kind: 'INGEST',
      key: original.s3Key,
      location: original.storageLocation,
    });
  }

  await db
    .update(StorageMove)
    .set({ status: 'GRACE', completedItems: 1 })
    .where(eq(StorageMove.id, moveId));
  return moved;
}

/** Delete an image move's source objects after the grace period. */
export async function cleanupImageMoveSource(
  moveId: string,
  objects: MovedImageObject[],
) {
  await setStorageMoveStatus(moveId, 'CLEANING');
  const byBucket = new Map<string, MovedImageObject[]>();
  for (const object of objects) {
    const key = `${object.location}:${object.kind}`;
    byBucket.set(key, [...(byBucket.get(key) ?? []), object]);
  }
  for (const group of byBucket.values()) {
    const first = group[0];
    if (!first) continue;
    await getLocation(first.location)
      .bucket(first.kind)
      .deleteKeys(
        group.map((o) => o.key),
        heartbeat,
      );
  }
  await setStorageMoveStatus(moveId, 'COMPLETED');
}

// --- Rebalance -------------------------------------------------------------

export {
  nextRebalanceBatch,
  planRebalance,
  type RebalanceBatch,
  type RebalanceCursor,
  type RebalanceGoal,
  rebalanceGoalBytes,
} from '../../storage/rebalance';

export async function updateRebalanceProgress(
  moveId: string,
  patch: {
    totalItems?: number;
    totalBytes?: string;
    status?: StorageMoveStatusValue;
  },
) {
  await db
    .update(StorageMove)
    .set({
      ...(patch.totalItems !== undefined
        ? { totalItems: patch.totalItems }
        : {}),
      ...(patch.totalBytes !== undefined
        ? { totalBytes: BigInt(patch.totalBytes) }
        : {}),
      ...(patch.status ? { status: patch.status } : {}),
    })
    .where(eq(StorageMove.id, moveId));
}

/** Moves (children of a rebalance) still holding a record lock. */
export async function activeChildMoves(parentId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(StorageMove)
    .where(
      and(
        eq(StorageMove.parentId, parentId),
        inArray(StorageMove.status, ['PENDING', 'COPYING']),
      ),
    );
  return row?.n ?? 0;
}
