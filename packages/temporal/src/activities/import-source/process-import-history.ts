import {
  ChannelImportHistoryBatch,
  ChannelImportHistoryItem,
  ChannelImportSource,
  db,
  ImportHistory,
} from '@letschurch/db';
import { and, asc, eq, gte, sql } from 'drizzle-orm';

import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'activity/process-import-history',
});

// Seven ImportHistory values per row leaves ample room beneath PostgreSQL's
// 65,535 bind-parameter ceiling and bounds each activity transaction.
export const HISTORICAL_IMPORT_PROCESS_CHUNK_SIZE = 500;

export type ProcessImportHistoryResult = {
  itemsProcessed: number;
};

/**
 * Copies a staged historical batch into ImportHistory in committed pages.
 * Progress and the source date bounds advance in the same transaction as each
 * page, so an activity retry resumes at the first uncommitted ordinal.
 */
export async function processImportHistory(
  importSourceId: string,
  batchId: string,
): Promise<ProcessImportHistoryResult> {
  return processImportHistoryWithDatabase(importSourceId, batchId, db);
}

export async function processImportHistoryWithDatabase(
  importSourceId: string,
  batchId: string,
  database: typeof db,
): Promise<ProcessImportHistoryResult> {
  const batch = await database.query.ChannelImportHistoryBatch.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, batchId), eq(t.importSourceId, importSourceId)),
  });

  if (!batch) {
    throw new Error(`Historical import batch ${batchId} not found`);
  }

  if (batch.status === 'DONE') {
    return { itemsProcessed: batch.totalItems };
  }

  await database
    .update(ChannelImportHistoryBatch)
    .set({
      status: 'RUNNING',
      startedAt: batch.startedAt ?? new Date(),
      failedAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(ChannelImportHistoryBatch.id, batchId));

  moduleLogger.info('Processing staged import history', {
    importSourceId,
    batchId,
    itemCount: batch.totalItems,
  });

  try {
    while (true) {
      const pageResult = await database.transaction(async (tx) => {
        const currentBatch = await tx.query.ChannelImportHistoryBatch.findFirst(
          {
            where: (t, { and, eq }) =>
              and(eq(t.id, batchId), eq(t.importSourceId, importSourceId)),
          },
        );

        if (!currentBatch) {
          throw new Error(`Historical import batch ${batchId} not found`);
        }

        if (currentBatch.status === 'DONE') {
          return { done: true, itemsProcessed: currentBatch.totalItems };
        }

        const items = await tx
          .select()
          .from(ChannelImportHistoryItem)
          .where(
            and(
              eq(ChannelImportHistoryItem.batchId, batchId),
              gte(
                ChannelImportHistoryItem.ordinal,
                currentBatch.processedItems,
              ),
            ),
          )
          .orderBy(asc(ChannelImportHistoryItem.ordinal))
          .limit(HISTORICAL_IMPORT_PROCESS_CHUNK_SIZE);

        if (items.length === 0) {
          if (currentBatch.processedItems !== currentBatch.totalItems) {
            throw new Error(
              `Historical import batch ${batchId} is missing staged items`,
            );
          }

          await tx
            .delete(ChannelImportHistoryItem)
            .where(eq(ChannelImportHistoryItem.batchId, batchId));
          await tx
            .update(ChannelImportHistoryBatch)
            .set({
              status: 'DONE',
              processedItems: currentBatch.totalItems,
              completedAt: new Date(),
              failedAt: null,
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(ChannelImportHistoryBatch.id, batchId));

          return { done: true, itemsProcessed: currentBatch.totalItems };
        }

        const earliestDate = items.reduce(
          (earliest, item) =>
            item.publishedAt < earliest ? item.publishedAt : earliest,
          items[0]!.publishedAt,
        );
        const latestDate = items.reduce(
          (latest, item) =>
            item.publishedAt > latest ? item.publishedAt : latest,
          items[0]!.publishedAt,
        );

        await tx
          .insert(ImportHistory)
          .values(
            items.map((item) => ({
              importSourceId,
              stagedItemId: item.id,
              title: item.title,
              description: item.description,
              url: item.url,
              publishedAt: item.publishedAt,
              source: item.source,
            })),
          )
          .onConflictDoNothing({ target: ImportHistory.stagedItemId });

        await tx
          .update(ChannelImportSource)
          .set({
            earliestImportDate: sql<Date>`least(coalesce(${ChannelImportSource.earliestImportDate}, ${earliestDate}), ${earliestDate})`,
            lastImportedUploadDate: sql<Date>`greatest(coalesce(${ChannelImportSource.lastImportedUploadDate}, ${latestDate}), ${latestDate})`,
            updatedAt: new Date(),
          })
          .where(eq(ChannelImportSource.id, importSourceId));

        const processedItems = items.at(-1)!.ordinal + 1;
        await tx
          .update(ChannelImportHistoryBatch)
          .set({
            status: 'RUNNING',
            processedItems,
            failedAt: null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(ChannelImportHistoryBatch.id, batchId));

        return { done: false, itemsProcessed: processedItems };
      });

      if (pageResult.done) {
        moduleLogger.info('Completed staged import history', {
          importSourceId,
          batchId,
          itemCount: pageResult.itemsProcessed,
        });
        return { itemsProcessed: pageResult.itemsProcessed };
      }
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown historical import error';
    await database
      .update(ChannelImportHistoryBatch)
      .set({
        status: 'FAILED',
        lastError: message,
        failedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ChannelImportHistoryBatch.id, batchId));
    moduleLogger.error('Failed staged import history', {
      importSourceId,
      batchId,
      error,
    });
    throw error;
  }
}
