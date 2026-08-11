import { describe, expect, it } from 'vitest';

import {
  encodeListMediaCursor,
  listMediaCursorSchema,
} from './list-pagination';

describe('list media cursor', () => {
  it.each([7, null])('round-trips a rank of %s', (rank) => {
    const cursor = {
      rank,
      createdAt: new Date('2026-08-11T12:34:56.789Z'),
      uploadRecordId: '00000000-0000-4000-8000-000000000001',
    };

    expect(listMediaCursorSchema.parse(encodeListMediaCursor(cursor))).toEqual(
      cursor,
    );
  });

  it('rejects malformed and incomplete cursors', () => {
    expect(listMediaCursorSchema.safeParse('not-json').success).toBe(false);
    expect(
      listMediaCursorSchema.safeParse(
        JSON.stringify({ rank: 1, createdAt: new Date().toISOString() }),
      ).success,
    ).toBe(false);
  });
});
