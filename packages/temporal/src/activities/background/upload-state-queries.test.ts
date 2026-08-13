import { inArray } from 'drizzle-orm';
import { describe, expect, test, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
});

// These imports are intentionally delayed until the safe test DATABASE_URL is set.
const { db, UploadState } = await import('@letschurch/db');
const { buildClaimUploadStatesForBackupQuery, claimUploadStatesForBackup } =
  await import('./upload-state-queries');

describe('upload-state backup claims', () => {
  test('generates one update with the ordered locked subquery inside it', () => {
    const { sql, params } = buildClaimUploadStatesForBackupQuery(7).toSQL();
    const normalizedSql = sql.replaceAll(/\s+/g, ' ').trim().toLowerCase();

    expect(normalizedSql).toMatch(/^update "upload_state" set /);
    expect(normalizedSql).toMatch(
      /where "upload_state"\."id" in \(select "id" from "upload_state" where .* order by "upload_state"\."created_at" asc limit \$\d+ for update skip locked\) returning "id"$/,
    );
    expect(params).toContain(7);
  });
});

const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === '1';

describe.skipIf(!runDatabaseTests)(
  'upload-state backup claim concurrency',
  () => {
    test('concurrent claimers receive disjoint rows and leave every claim backing up', async () => {
      const keyPrefix = `claim-test/${crypto.randomUUID()}`;
      const createdAt = new Date('2000-01-01T00:00:00.000Z');
      const seeded = await db
        .insert(UploadState)
        .values(
          Array.from({ length: 6 }, (_, index) => ({
            s3Key: `${keyPrefix}/${index}`,
            s3Bucket: 'claim-test',
            uploadType: 'MEDIA' as const,
            backupStatus: 'NOT_BACKED_UP' as const,
            createdAt: new Date(createdAt.getTime() + index),
            updatedAt: createdAt,
          })),
        )
        .returning({ id: UploadState.id });
      const seededIds = seeded.map(({ id }) => id);

      try {
        const [first, second] = await Promise.all([
          claimUploadStatesForBackup(3),
          claimUploadStatesForBackup(3),
        ]);
        const firstIds = new Set(first.map(({ id }) => id));
        const secondIds = new Set(second.map(({ id }) => id));
        const allClaimedIds = [...firstIds, ...secondIds];

        expect(firstIds.size).toBe(3);
        expect(secondIds.size).toBe(3);
        expect([...firstIds].filter((id) => secondIds.has(id))).toEqual([]);
        expect(new Set(allClaimedIds)).toEqual(new Set(seededIds));

        const finalRows = await db
          .select({
            id: UploadState.id,
            backupStatus: UploadState.backupStatus,
          })
          .from(UploadState)
          .where(inArray(UploadState.id, seededIds));
        expect(finalRows).toHaveLength(6);
        expect(
          finalRows.every(({ backupStatus }) => backupStatus === 'BACKING_UP'),
        ).toBe(true);
      } finally {
        await db.delete(UploadState).where(inArray(UploadState.id, seededIds));
      }
    });
  },
);
