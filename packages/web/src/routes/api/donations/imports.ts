import { DonationImportBatch, db } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  parseImportCsv,
  prepareTransactionHistory,
} from '@/donations/import-history';
import { applyTransactionHistory } from '@/donations/import-history-apply';
import { prepareRecurringMigration } from '@/donations/import-recurring';
import { applyRecurringPlanImport } from '@/donations/import-recurring-apply';
import logger from '@/util/logger';
import {
  readRequestBody,
  RequestBodyTooLargeError,
} from '@/util/read-request-body';

const moduleLogger = logger.child({
  module: 'routes/api/donations/imports',
});
const MAX_IMPORT_BODY_BYTES = 20 * 1024 * 1024;
const MAX_TRANSACTION_APPLY_ROWS = 2_000;
const MAX_RECURRING_APPLY_ROWS = 25;
const csvSchema = z
  .string()
  .min(1)
  .max(7 * 1024 * 1024);
const filenameSchema = z.string().trim().min(1).max(255);
const importRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TRANSACTION_HISTORY'),
    action: z.enum(['VALIDATE', 'APPLY']),
    filename: filenameSchema,
    csv: csvSchema,
  }),
  z.object({
    type: z.literal('RECURRING_PLANS'),
    action: z.enum(['VALIDATE', 'APPLY']),
    plansFilename: filenameSchema,
    plansCsv: csvSchema,
    mappingFilename: filenameSchema,
    mappingCsv: csvSchema,
    linksFilename: filenameSchema,
    linksCsv: csvSchema,
    cutoverConfirmed: z.boolean().default(false),
    liveConfirmed: z.boolean().default(false),
  }),
]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The import failed.';
}

export const Route = createFileRoute('/api/donations/imports')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getSession } = await import('@/util/auth');
        const session = await getSession();
        if (!session) return new Response('unauthorized', { status: 401 });
        if (session.appUser.role !== 'ADMIN') {
          return new Response('forbidden', { status: 403 });
        }
        if (
          !request.headers.get('content-type')?.startsWith('application/json')
        ) {
          return Response.json(
            { error: 'Expected a JSON request.' },
            { status: 415 },
          );
        }

        let batchId: string | null = null;
        try {
          const rawBody = await readRequestBody(request, MAX_IMPORT_BODY_BYTES);
          const input = importRequestSchema.parse(JSON.parse(rawBody));
          if (
            input.type === 'RECURRING_PLANS' &&
            input.action === 'APPLY' &&
            !input.cutoverConfirmed
          ) {
            return Response.json(
              {
                error:
                  'Confirm that the source plans can no longer charge donors.',
              },
              { status: 400 },
            );
          }

          const filename =
            input.type === 'TRANSACTION_HISTORY'
              ? input.filename
              : [
                  input.plansFilename,
                  input.mappingFilename,
                  input.linksFilename,
                ].join(', ');
          const [batch] = await db
            .insert(DonationImportBatch)
            .values({
              type: input.type,
              status: 'RUNNING',
              filename,
              createdById: session.appUserId,
              updatedAt: new Date(),
            })
            .returning({ id: DonationImportBatch.id });
          if (!batch) throw new Error('Could not start the import.');
          batchId = batch.id;

          if (input.type === 'TRANSACTION_HISTORY') {
            const history = prepareTransactionHistory(input.csv);
            if (
              input.action === 'APPLY' &&
              history.donations.length > MAX_TRANSACTION_APPLY_ROWS
            ) {
              throw new Error(
                `Apply transaction history in batches of ${MAX_TRANSACTION_APPLY_ROWS.toLocaleString()} ready rows or fewer.`,
              );
            }
            await db
              .update(DonationImportBatch)
              .set({
                rowCount: history.rowCount,
                readyCount: history.donations.length,
                skippedCount: history.skippedCount,
                updatedAt: new Date(),
              })
              .where(eq(DonationImportBatch.id, batchId));
            const applied =
              input.action === 'APPLY'
                ? await applyTransactionHistory(
                    history,
                    async ({ importedCount, duplicateCount }) => {
                      await db
                        .update(DonationImportBatch)
                        .set({
                          importedCount,
                          duplicateCount,
                          updatedAt: new Date(),
                        })
                        .where(eq(DonationImportBatch.id, batchId!));
                    },
                  )
                : { importedCount: 0, duplicateCount: 0 };
            const result = {
              batchId,
              rowCount: history.rowCount,
              readyCount: history.donations.length,
              skippedCount: history.skippedCount,
              ...applied,
            };
            await db
              .update(DonationImportBatch)
              .set({
                status: input.action === 'APPLY' ? 'COMPLETED' : 'VALIDATED',
                rowCount: result.rowCount,
                readyCount: result.readyCount,
                skippedCount: result.skippedCount,
                importedCount: result.importedCount,
                duplicateCount: result.duplicateCount,
                summary: {
                  source: 'Transaction history CSV',
                },
                completedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(DonationImportBatch.id, batchId));
            return Response.json(result);
          }

          const planRows = parseImportCsv(input.plansCsv);
          const migration = prepareRecurringMigration({
            planRows,
            mappingRows: parseImportCsv(input.mappingCsv),
            linkRows: parseImportCsv(input.linksCsv),
          });
          if (
            input.action === 'APPLY' &&
            migration.plans.length > MAX_RECURRING_APPLY_ROWS
          ) {
            throw new Error(
              `Apply recurring plans in batches of ${MAX_RECURRING_APPLY_ROWS} active plans or fewer.`,
            );
          }
          const scheduledCents = migration.plans.reduce(
            (total, plan) => total + plan.amountCents,
            0,
          );
          await db
            .update(DonationImportBatch)
            .set({
              rowCount: planRows.length,
              readyCount: migration.plans.length,
              skippedCount: migration.skippedInactive,
              summary: {
                source: 'Recurring plan CSVs',
                scheduledCents,
              },
              updatedAt: new Date(),
            })
            .where(eq(DonationImportBatch.id, batchId));
          const applied =
            input.action === 'APPLY'
              ? await applyRecurringPlanImport(migration.plans, {
                  liveConfirmed: input.liveConfirmed,
                  onProgress: async ({
                    createdCount,
                    recoveredCount,
                    duplicateCount,
                  }) => {
                    await db
                      .update(DonationImportBatch)
                      .set({
                        importedCount: createdCount + recoveredCount,
                        duplicateCount,
                        summary: {
                          source: 'Recurring plan CSVs',
                          scheduledCents,
                          createdCount,
                          recoveredCount,
                          stripeMode: 'running',
                        },
                        updatedAt: new Date(),
                      })
                      .where(eq(DonationImportBatch.id, batchId!));
                  },
                })
              : {
                  mode: 'not-checked' as const,
                  createdCount: 0,
                  recoveredCount: 0,
                  duplicateCount: 0,
                };
          const importedCount = applied.createdCount + applied.recoveredCount;
          const result = {
            batchId,
            rowCount: planRows.length,
            readyCount: migration.plans.length,
            skippedCount: migration.skippedInactive,
            importedCount,
            duplicateCount: applied.duplicateCount,
            createdCount: applied.createdCount,
            recoveredCount: applied.recoveredCount,
            scheduledCents,
            mode: applied.mode,
          };
          await db
            .update(DonationImportBatch)
            .set({
              status: input.action === 'APPLY' ? 'COMPLETED' : 'VALIDATED',
              rowCount: result.rowCount,
              readyCount: result.readyCount,
              skippedCount: result.skippedCount,
              importedCount,
              duplicateCount: result.duplicateCount,
              summary: {
                source: 'Recurring plan CSVs',
                scheduledCents,
                createdCount: result.createdCount,
                recoveredCount: result.recoveredCount,
                stripeMode: result.mode,
              },
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(DonationImportBatch.id, batchId));
          return Response.json(result);
        } catch (error) {
          const message = errorMessage(error);
          if (batchId) {
            await db
              .update(DonationImportBatch)
              .set({
                status: 'FAILED',
                error: message.slice(0, 4_000),
                completedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(DonationImportBatch.id, batchId));
          }
          moduleLogger.warn(
            {
              appUserId: session.appUserId,
              err: error instanceof Error ? error : new Error(String(error)),
            },
            'Donation import failed',
          );
          if (error instanceof RequestBodyTooLargeError) {
            return Response.json(
              { error: 'The import files are too large.' },
              { status: 413 },
            );
          }
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
