import { Channel, db, UploadRecord } from '@letschurch/db';
import { and, asc, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';

export type DuplicateUploadsInput = {
  limit: number;
  offset: number;
  matchPublishedAt: boolean;
};

type UploadRecordRow = typeof UploadRecord.$inferSelect;
type ChannelRow = typeof Channel.$inferSelect;

type DuplicateUploadRow = {
  id: UploadRecordRow['id'] | null;
  title: UploadRecordRow['title'];
  createdAt: UploadRecordRow['createdAt'] | null;
  publishedAt: UploadRecordRow['publishedAt'] | null;
  channelId: ChannelRow['id'] | null;
  channelName: ChannelRow['name'] | null;
  channelSlug: ChannelRow['slug'] | null;
  groupCount: number;
};

type DuplicateUploadGroup = {
  channelId: ChannelRow['id'];
  channelName: ChannelRow['name'];
  channelSlug: ChannelRow['slug'];
  title: UploadRecordRow['title'];
  publishedAt: UploadRecordRow['publishedAt'];
  uploads: Array<{
    id: UploadRecordRow['id'];
    createdAt: UploadRecordRow['createdAt'];
    publishedAt: UploadRecordRow['publishedAt'];
  }>;
};

const duplicateUploadColumns = {
  id: UploadRecord.id,
  title: UploadRecord.title,
  createdAt: UploadRecord.createdAt,
  publishedAt: UploadRecord.publishedAt,
  channelId: Channel.id,
  channelName: Channel.name,
  channelSlug: Channel.slug,
};

function duplicateGroupColumns() {
  return {
    channelId: UploadRecord.channelId,
    title: UploadRecord.title,
    duplicateCount: count().as('duplicate_count'),
  };
}

function buildRowsWithPublishedAt({
  limit,
  offset,
}: Omit<DuplicateUploadsInput, 'matchPublishedAt'>) {
  const allDuplicateKeys = db.$with('all_duplicate_keys').as(
    db
      .select({
        ...duplicateGroupColumns(),
        publishedAt: UploadRecord.publishedAt,
      })
      .from(UploadRecord)
      .where(isNull(UploadRecord.deletedAt))
      .groupBy(
        UploadRecord.channelId,
        UploadRecord.title,
        UploadRecord.publishedAt,
      )
      .having(gt(count(), 1)),
  );
  const duplicateKeys = db
    .$with('duplicate_keys')
    .as(
      db
        .select()
        .from(allDuplicateKeys)
        .orderBy(
          desc(allDuplicateKeys.duplicateCount),
          asc(allDuplicateKeys.title),
          asc(allDuplicateKeys.channelId),
          asc(allDuplicateKeys.publishedAt),
        )
        .limit(limit)
        .offset(offset),
    );
  const duplicateTotals = db
    .$with('duplicate_totals')
    .as(
      db
        .select({ groupCount: count().as('group_count') })
        .from(allDuplicateKeys),
    );

  return db
    .with(allDuplicateKeys, duplicateKeys, duplicateTotals)
    .select({
      ...duplicateUploadColumns,
      groupCount: duplicateTotals.groupCount,
    })
    .from(duplicateTotals)
    .leftJoin(duplicateKeys, sql`true`)
    .leftJoin(
      UploadRecord,
      and(
        eq(duplicateKeys.channelId, UploadRecord.channelId),
        sql`${duplicateKeys.title} is not distinct from ${UploadRecord.title}`,
        eq(duplicateKeys.publishedAt, UploadRecord.publishedAt),
        isNull(UploadRecord.deletedAt),
      ),
    )
    .leftJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .orderBy(
      desc(duplicateKeys.duplicateCount),
      asc(duplicateKeys.title),
      asc(duplicateKeys.channelId),
      asc(duplicateKeys.publishedAt),
      asc(UploadRecord.createdAt),
      asc(UploadRecord.id),
    );
}

function buildRowsWithoutPublishedAt({
  limit,
  offset,
}: Omit<DuplicateUploadsInput, 'matchPublishedAt'>) {
  const allDuplicateKeys = db
    .$with('all_duplicate_keys')
    .as(
      db
        .select(duplicateGroupColumns())
        .from(UploadRecord)
        .where(isNull(UploadRecord.deletedAt))
        .groupBy(UploadRecord.channelId, UploadRecord.title)
        .having(gt(count(), 1)),
    );
  const duplicateKeys = db
    .$with('duplicate_keys')
    .as(
      db
        .select()
        .from(allDuplicateKeys)
        .orderBy(
          desc(allDuplicateKeys.duplicateCount),
          asc(allDuplicateKeys.title),
          asc(allDuplicateKeys.channelId),
        )
        .limit(limit)
        .offset(offset),
    );
  const duplicateTotals = db
    .$with('duplicate_totals')
    .as(
      db
        .select({ groupCount: count().as('group_count') })
        .from(allDuplicateKeys),
    );

  return db
    .with(allDuplicateKeys, duplicateKeys, duplicateTotals)
    .select({
      ...duplicateUploadColumns,
      groupCount: duplicateTotals.groupCount,
    })
    .from(duplicateTotals)
    .leftJoin(duplicateKeys, sql`true`)
    .leftJoin(
      UploadRecord,
      and(
        eq(duplicateKeys.channelId, UploadRecord.channelId),
        sql`${duplicateKeys.title} is not distinct from ${UploadRecord.title}`,
        isNull(UploadRecord.deletedAt),
      ),
    )
    .leftJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .orderBy(
      desc(duplicateKeys.duplicateCount),
      asc(duplicateKeys.title),
      asc(duplicateKeys.channelId),
      asc(UploadRecord.createdAt),
      asc(UploadRecord.id),
    );
}

function groupRows(rows: DuplicateUploadRow[], matchPublishedAt: boolean) {
  const groups = new Map<string, DuplicateUploadGroup>();

  for (const row of rows) {
    if (
      row.id === null ||
      row.createdAt === null ||
      row.publishedAt === null ||
      row.channelId === null ||
      row.channelName === null ||
      row.channelSlug === null
    ) {
      continue;
    }

    const key = JSON.stringify(
      matchPublishedAt
        ? [row.channelId, row.title, row.publishedAt]
        : [row.channelId, row.title],
    );
    let group = groups.get(key);
    if (!group) {
      group = {
        channelId: row.channelId,
        channelName: row.channelName,
        channelSlug: row.channelSlug,
        title: row.title,
        publishedAt: row.publishedAt,
        uploads: [],
      };
      groups.set(key, group);
    }
    group.uploads.push({
      id: row.id,
      createdAt: row.createdAt,
      publishedAt: row.publishedAt,
    });
  }

  return Array.from(groups.values());
}

export function buildDuplicateUploadsQuery(input: DuplicateUploadsInput) {
  return input.matchPublishedAt
    ? buildRowsWithPublishedAt(input)
    : buildRowsWithoutPublishedAt(input);
}

export async function getDuplicateUploads(input: DuplicateUploadsInput) {
  const rows: DuplicateUploadRow[] = await buildDuplicateUploadsQuery(input);

  return {
    groups: groupRows(rows, input.matchPublishedAt),
    totalGroups: rows[0]?.groupCount ?? 0,
  };
}
