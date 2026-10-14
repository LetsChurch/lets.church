import { db, UploadRecord } from '@letschurch/db';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { getLocationCandidates } from './usage';

// Rebalance planning. No Temporal imports, so the admin UI can preview a plan
// from web as well as the rebalance workflow's activities.

export type RebalanceGoal =
  | { type: 'bytes'; bytes: string }
  | { type: 'percent'; percent: number }
  | { type: 'all' };

export type RebalanceCursor = { bytes: string; id: string } | null;

export type RebalanceBatch = {
  records: Array<{ id: string; bytes: string }>;
  cursor: RebalanceCursor;
  done: boolean;
};

const recordBytes = sql<string>`coalesce(${UploadRecord.uploadSizeBytes}, 0) + coalesce(${UploadRecord.publicSizeBytes}, 0)`;

/**
 * Next page of records to move off `sourceLocation`, largest first so the
 * fewest moves free the most bytes. Skips records that are locked, deleted,
 * parked, or still processing (no measured public size yet).
 */
export async function nextRebalanceBatch(params: {
  sourceLocation: string;
  cursor: RebalanceCursor;
  limit: number;
}): Promise<RebalanceBatch> {
  const { sourceLocation, cursor, limit } = params;
  const rows = await db
    .select({ id: UploadRecord.id, bytes: recordBytes })
    .from(UploadRecord)
    .where(
      and(
        eq(UploadRecord.storageLocation, sourceLocation),
        isNull(UploadRecord.storageMoveId),
        isNull(UploadRecord.deletedAt),
        isNull(UploadRecord.storageWaitingSince),
        sql`${UploadRecord.publicSizeBytes} is not null`,
        cursor
          ? or(
              lt(recordBytes, cursor.bytes),
              and(
                sql`${recordBytes} = ${cursor.bytes}`,
                lt(UploadRecord.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(recordBytes), desc(UploadRecord.id))
    .limit(limit);

  const last = rows.at(-1);
  return {
    records: rows.map((r) => ({ id: r.id, bytes: String(r.bytes) })),
    cursor: last ? { bytes: String(last.bytes), id: last.id } : cursor,
    done: rows.length < limit,
  };
}

/** Preview of what a rebalance would move (count and bytes). */
export async function planRebalance(params: {
  sourceLocation: string;
  goal: RebalanceGoal;
}): Promise<{ records: number; bytes: string; goalBytes: string | null }> {
  const goalBytes = await goalBytesFor(params.sourceLocation, params.goal);
  let cursor: RebalanceCursor = null;
  let records = 0;
  let bytes = 0n;
  for (;;) {
    const batch = await nextRebalanceBatch({
      sourceLocation: params.sourceLocation,
      cursor,
      limit: 500,
    });
    for (const record of batch.records) {
      if (goalBytes !== null && bytes >= goalBytes) break;
      records += 1;
      bytes += BigInt(record.bytes);
    }
    if (batch.done || (goalBytes !== null && bytes >= goalBytes)) break;
    cursor = batch.cursor;
  }
  return {
    records,
    bytes: String(bytes),
    goalBytes: goalBytes === null ? null : String(goalBytes),
  };
}

/**
 * Bytes a goal asks to move, or null for "everything". Serialized as a string
 * since it's returned from an activity (Temporal can't encode bigint).
 */
export async function rebalanceGoalBytes(
  sourceLocation: string,
  goal: RebalanceGoal,
): Promise<string | null> {
  const bytes = await goalBytesFor(sourceLocation, goal);
  return bytes === null ? null : String(bytes);
}

async function goalBytesFor(
  sourceLocation: string,
  goal: RebalanceGoal,
): Promise<bigint | null> {
  if (goal.type === 'all') return null;
  if (goal.type === 'bytes') return BigInt(goal.bytes);
  const candidate = (await getLocationCandidates()).find(
    (c) => c.id === sourceLocation,
  );
  const cap = candidate?.publicMax ?? candidate?.ingestMax ?? null;
  if (!candidate || cap === null) {
    throw new Error(
      `Location ${sourceLocation} has no cap; use a byte goal instead of a percentage`,
    );
  }
  const used =
    candidate.publicMax !== null
      ? candidate.usage.publicUsed + candidate.usage.publicReserved
      : candidate.usage.ingestUsed;
  const allowed = (cap * BigInt(Math.round(goal.percent * 100))) / 10_000n;
  return used > allowed ? used - allowed : 0n;
}
