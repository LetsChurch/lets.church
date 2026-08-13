import { db, UploadState } from '@letschurch/db';
import { asc, eq, inArray } from 'drizzle-orm';

export function buildClaimUploadStatesForBackupQuery(limit: number) {
  const claimableIds = db
    .select({ id: UploadState.id })
    .from(UploadState)
    .where(eq(UploadState.backupStatus, 'NOT_BACKED_UP'))
    .orderBy(asc(UploadState.createdAt))
    .limit(limit)
    .for('update', { skipLocked: true });

  return db
    .update(UploadState)
    .set({ backupStatus: 'BACKING_UP', updatedAt: new Date() })
    .where(inArray(UploadState.id, claimableIds))
    .returning({ id: UploadState.id });
}

export async function claimUploadStatesForBackup(
  limit: number,
): Promise<Array<{ id: string }>> {
  return buildClaimUploadStatesForBackupQuery(limit);
}
