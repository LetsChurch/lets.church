import { z } from 'zod';

export const importSourceIdSchema = z.string().uuid();

export const deduplicationFieldSchema = z.enum(['title', 'publishedAt', 'url']);

// Each staged row binds nine values. A 5,000-item request stays well below
// PostgreSQL's 65,535-parameter limit even before insert chunking.
export const HISTORICAL_IMPORT_ITEM_MAX = 5_000;

export const historicalImportItemSchema = z.object({
  publishedAt: z.coerce.date(),
  source: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  url: z.string().url().optional().nullable(),
});

export const importSourceSchema = z.object({
  channelId: z.string().uuid(),
  url: z.string().url(),
  enabled: z.boolean().optional().default(true),
  cronSchedule: z.string().optional().default('0 1 * * *'), // Daily at 1am
  timezone: z.string().optional().default('America/New_York'),
  earliestImportDate: z.coerce.date().optional(),
  deduplicationEnabled: z.boolean().optional().default(false),
  deduplicationFields: z.array(deduplicationFieldSchema).optional().default([]),
  importHistory: z
    .array(historicalImportItemSchema)
    .max(HISTORICAL_IMPORT_ITEM_MAX)
    .optional(),
});

export const updateImportSourceSchema = z.object({
  id: importSourceIdSchema,
  data: importSourceSchema.partial(),
});

export const importSourceFilterSchema = z
  .object({
    channelId: z.string().uuid().optional(),
  })
  .optional();

export const importRunsQuerySchema = z.object({
  importSourceId: importSourceIdSchema,
  limit: z.number().min(1).max(100).optional().default(20),
});
