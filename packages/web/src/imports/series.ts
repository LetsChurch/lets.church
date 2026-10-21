import { db, UploadList, UploadListEntry } from '@letschurch/db';
import { and, eq, isNull, max, sql } from 'drizzle-orm';
import type { z } from 'zod';

import type { importSeriesSchema } from '@/schemas/dashboard';

export type ImportSeries = z.infer<typeof importSeriesSchema>;

export class ImportSeriesError extends Error {}

/**
 * Resolve the series a batch import (CSV or feed) lands in and the rank its
 * first item takes; item N gets `firstRank + N`, so the batch keeps its source
 * order however the downloads interleave.
 *
 * - `new` creates a public series on the channel.
 * - `existing` must be one of the channel's series. Postgres sorts NULL ranks
 *   last, and entries added through the dashboard have none, so any unranked
 *   entries are first ranked in their current display order; otherwise the
 *   ranked imports would jump ahead of them.
 *
 * Ranks are reserved from the series' current entries only: an earlier import
 * into the same series that is still downloading has not inserted its entries
 * yet, so start the next one after it finishes or the two will interleave.
 */
export async function resolveImportSeries(
  channelId: string,
  authorId: string,
  series: ImportSeries,
): Promise<{ id: string; firstRank: number; created: boolean }> {
  if (series.mode === 'new') {
    const [created] = await db
      .insert(UploadList)
      .values({
        title: series.title,
        type: 'SERIES',
        visibility: 'PUBLIC',
        authorId,
        channelId,
        updatedAt: new Date(),
      })
      .returning({ id: UploadList.id });
    if (!created) throw new Error('Failed to create series');
    return { id: created.id, firstRank: 0, created: true };
  }

  return db.transaction(async (tx) => {
    // Lock the series so two appends can't both rank the same entries.
    const [existing] = await tx
      .select({
        id: UploadList.id,
        channelId: UploadList.channelId,
        type: UploadList.type,
      })
      .from(UploadList)
      .where(eq(UploadList.id, series.seriesId))
      .for('update');

    if (!existing || existing.channelId !== channelId) {
      throw new ImportSeriesError('Series not found in this channel.');
    }
    if (existing.type !== 'SERIES') {
      throw new ImportSeriesError('Choose a series, not a playlist.');
    }

    const [unranked] = await tx
      .select({ id: UploadListEntry.uploadRecordId })
      .from(UploadListEntry)
      .where(
        and(
          eq(UploadListEntry.uploadListId, existing.id),
          isNull(UploadListEntry.rank),
        ),
      )
      .limit(1);

    if (unranked) {
      await tx.execute(sql`
        update ${UploadListEntry} as e
        set rank = o.position
        from (
          select upload_record_id,
                 (row_number() over (order by rank asc nulls last, created_at asc) - 1)::int as position
          from ${UploadListEntry}
          where upload_list_id = ${existing.id}
        ) as o
        where e.upload_list_id = ${existing.id}
          and e.upload_record_id = o.upload_record_id
      `);
    }

    const [{ maxRank } = { maxRank: null }] = await tx
      .select({ maxRank: max(UploadListEntry.rank) })
      .from(UploadListEntry)
      .where(eq(UploadListEntry.uploadListId, existing.id));

    return {
      id: existing.id,
      firstRank: maxRank === null ? 0 : maxRank + 1,
      created: false,
    };
  });
}

/** Undo a series {@link resolveImportSeries} created when its import fails to start. */
export async function discardCreatedImportSeries(series: {
  id: string;
  created: boolean;
}) {
  if (series.created) {
    await db.delete(UploadList).where(eq(UploadList.id, series.id));
  }
}
