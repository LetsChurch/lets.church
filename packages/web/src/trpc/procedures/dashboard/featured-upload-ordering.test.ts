import { asc, eq } from 'drizzle-orm';
import { describe, expect, test, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
});

// The db module parses DATABASE_URL on import, so load it after the test default.

const {
  AppUser,
  Channel,
  compactFeaturedUploadRanks,
  db,
  FeaturedUpload,
  UploadRecord,
  withFeaturedUploadOrderingLock,
} = await import('@letschurch/db');
const { reorderFeaturedUploadsAtomically } =
  await import('./featured-upload-ordering');

const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === '1';

describe.skipIf(!runDatabaseTests)('featured upload deletion', () => {
  test('compacts cascading deletions and repairs an existing gap when reordering', async () => {
    const suffix = crypto.randomUUID();
    const now = new Date();
    const [{ userId }] = await db
      .insert(AppUser)
      .values({ username: `featured-test-${suffix}`, updatedAt: now })
      .returning({ userId: AppUser.id });
    const [{ channelId }] = await db
      .insert(Channel)
      .values({
        name: 'Featured test',
        slug: `featured-test-${suffix}`,
        updatedAt: now,
      })
      .returning({ channelId: Channel.id });

    try {
      const uploads = await db
        .insert(UploadRecord)
        .values(
          Array.from({ length: 3 }, () => ({
            appUserId: userId,
            channelId,
            license: 'STANDARD' as const,
            visibility: 'PUBLIC' as const,
            variants: [],
            updatedAt: now,
          })),
        )
        .returning({ id: UploadRecord.id });
      const [first, second, third] = uploads.map(({ id }) => id);
      const original = await withFeaturedUploadOrderingLock(async (tx) => {
        const rows = await compactFeaturedUploadRanks(tx);
        await tx.insert(FeaturedUpload).values(
          uploads.map(({ id }, index) => ({
            uploadRecordId: id,
            rank: rows.length + index,
            updatedAt: now,
          })),
        );
        return rows.map(({ uploadRecordId }) => uploadRecordId);
      });

      await withFeaturedUploadOrderingLock(async (tx) => {
        await tx.delete(UploadRecord).where(eq(UploadRecord.id, first!));
        await compactFeaturedUploadRanks(tx);
      });
      let rows = await db
        .select({
          id: FeaturedUpload.uploadRecordId,
          rank: FeaturedUpload.rank,
        })
        .from(FeaturedUpload)
        .orderBy(asc(FeaturedUpload.rank));
      expect(rows.map(({ id }) => id)).toEqual([...original, second, third]);
      expect(rows.map(({ rank }) => rank)).toEqual(rows.map((_, i) => i));

      // Simulate the historical FK cascade that left a rank gap.
      await db.delete(UploadRecord).where(eq(UploadRecord.id, second!));
      await reorderFeaturedUploadsAtomically([third!, ...original]);
      rows = await db
        .select({
          id: FeaturedUpload.uploadRecordId,
          rank: FeaturedUpload.rank,
        })
        .from(FeaturedUpload)
        .orderBy(asc(FeaturedUpload.rank));
      expect(rows.map(({ id }) => id)).toEqual([third, ...original]);
      expect(rows.map(({ rank }) => rank)).toEqual(rows.map((_, i) => i));
    } finally {
      await withFeaturedUploadOrderingLock(async (tx) => {
        await tx
          .delete(UploadRecord)
          .where(eq(UploadRecord.channelId, channelId));
        await compactFeaturedUploadRanks(tx);
      });
      await db.delete(Channel).where(eq(Channel.id, channelId));
      await db.delete(AppUser).where(eq(AppUser.id, userId));
    }
  });
});
