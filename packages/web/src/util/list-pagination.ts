import { z } from 'zod';

const listMediaCursorPayloadSchema = z.object({
  rank: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  uploadRecordId: z.string().uuid(),
});

export type ListMediaCursor = {
  rank: number | null;
  createdAt: Date;
  uploadRecordId: string;
};

/**
 * Cursors stay strings at the API boundary so existing infinite-query clients
 * continue treating them as opaque values, while carrying every column in the
 * list's stable sort order.
 */
export const listMediaCursorSchema = z.string().transform((value, ctx) => {
  let decoded: unknown;

  try {
    decoded = JSON.parse(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid list cursor' });
    return z.NEVER;
  }

  const result = listMediaCursorPayloadSchema.safeParse(decoded);
  if (!result.success) {
    ctx.addIssue({ code: 'custom', message: 'Invalid list cursor' });
    return z.NEVER;
  }

  return {
    rank: result.data.rank,
    createdAt: new Date(result.data.createdAt),
    uploadRecordId: result.data.uploadRecordId,
  } satisfies ListMediaCursor;
});

export function encodeListMediaCursor(cursor: ListMediaCursor): string {
  return JSON.stringify({
    rank: cursor.rank,
    createdAt: cursor.createdAt.toISOString(),
    uploadRecordId: cursor.uploadRecordId,
  });
}
