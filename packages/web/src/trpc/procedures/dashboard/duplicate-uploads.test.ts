import { eq, inArray } from 'drizzle-orm';
import { describe, expect, test, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
});

// These imports are intentionally delayed until the safe test DATABASE_URL is set.
const { AppUser, Channel, db, UploadRecord } = await import('@letschurch/db');
const { buildDuplicateUploadsQuery, getDuplicateUploads } =
  await import('./duplicate-uploads');

describe('duplicate upload query generation', () => {
  test.each([true, false])(
    'counts groups before pagination and matches nullable titles (publishedAt=%s)',
    (matchPublishedAt) => {
      const normalizedSql = buildDuplicateUploadsQuery({
        limit: 2,
        offset: 1,
        matchPublishedAt,
      })
        .toSQL()
        .sql.replaceAll(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      expect(normalizedSql).toContain(
        '"duplicate_totals" as (select count(*) as "group_count" from "all_duplicate_keys")',
      );
      expect(normalizedSql).toContain(
        'from "duplicate_totals" left join "duplicate_keys" on true',
      );
      expect(normalizedSql).toContain('is not distinct from');
    },
  );
});

const runDatabaseTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === '1';

describe.skipIf(!runDatabaseTests)('duplicate upload grouping behavior', () => {
  test('returns unpaged totals, deterministic pages, null titles, and both grouping modes', async () => {
    const suffix = crypto.randomUUID();
    const now = new Date('2025-01-01T00:00:00.000Z');
    const [{ userId }] = await db
      .insert(AppUser)
      .values({ username: `duplicate-test-${suffix}`, updatedAt: now })
      .returning({ userId: AppUser.id });
    const [{ channelId }] = await db
      .insert(Channel)
      .values({
        name: 'Duplicate test channel',
        slug: `duplicate-test-${suffix}`,
        updatedAt: now,
      })
      .returning({ channelId: Channel.id });

    const firstDate = new Date('2025-02-01T00:00:00.000Z');
    const secondDate = new Date('2025-02-02T00:00:00.000Z');
    const groupSpecs = [
      { title: null, publishedAt: firstDate, count: 3 },
      { title: 'Same', publishedAt: firstDate, count: 2 },
      { title: 'Same', publishedAt: secondDate, count: 2 },
      { title: 'Tie', publishedAt: firstDate, count: 2 },
      { title: 'Tie', publishedAt: secondDate, count: 2 },
    ] as const;
    const uploads = groupSpecs.flatMap((group, groupIndex) =>
      Array.from({ length: group.count }, (_, rowIndex) => ({
        title: group.title,
        appUserId: userId,
        license: 'STANDARD' as const,
        channelId,
        visibility: 'PUBLIC' as const,
        variants: [],
        publishedAt: group.publishedAt,
        createdAt: new Date(now.getTime() + groupIndex * 100 + rowIndex),
        updatedAt: now,
      })),
    );

    try {
      const inserted = await db
        .insert(UploadRecord)
        .values(uploads)
        .returning({ id: UploadRecord.id });

      const publishedPage = await getDuplicateUploads({
        limit: 2,
        offset: 1,
        matchPublishedAt: true,
      });
      expect(publishedPage.totalGroups).toBe(5);
      expect(
        publishedPage.groups.map(({ title, publishedAt }) => [
          title,
          publishedAt.toISOString(),
        ]),
      ).toEqual([
        ['Same', firstDate.toISOString()],
        ['Same', secondDate.toISOString()],
      ]);

      const publishedNull = await getDuplicateUploads({
        limit: 1,
        offset: 0,
        matchPublishedAt: true,
      });
      expect(publishedNull.totalGroups).toBe(5);
      expect(publishedNull.groups).toHaveLength(1);
      expect(publishedNull.groups[0]?.title).toBeNull();
      expect(publishedNull.groups[0]?.uploads).toHaveLength(3);

      const beyondFinalPage = await getDuplicateUploads({
        limit: 2,
        offset: 99,
        matchPublishedAt: true,
      });
      expect(beyondFinalPage).toEqual({ groups: [], totalGroups: 5 });

      const titlePage = await getDuplicateUploads({
        limit: 1,
        offset: 1,
        matchPublishedAt: false,
      });
      expect(titlePage.totalGroups).toBe(3);
      expect(titlePage.groups.map(({ title }) => title)).toEqual(['Tie']);
      expect(titlePage.groups[0]?.uploads).toHaveLength(4);

      const titleNull = await getDuplicateUploads({
        limit: 1,
        offset: 2,
        matchPublishedAt: false,
      });
      expect(titleNull.totalGroups).toBe(3);
      expect(titleNull.groups[0]?.title).toBeNull();
      expect(titleNull.groups[0]?.uploads).toHaveLength(3);

      await db.delete(UploadRecord).where(
        inArray(
          UploadRecord.id,
          inserted.map(({ id }) => id),
        ),
      );
    } finally {
      await db
        .delete(UploadRecord)
        .where(eq(UploadRecord.channelId, channelId));
      await db.delete(Channel).where(eq(Channel.id, channelId));
      await db.delete(AppUser).where(eq(AppUser.id, userId));
    }
  });
});
