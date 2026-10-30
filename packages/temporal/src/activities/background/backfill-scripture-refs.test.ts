import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ allocation: vi.fn() }));

vi.mock('@letschurch/db', () => ({
  Annotation: {},
  db: {},
  TranscriptParagraph: {},
  UploadRecord: {},
}));
vi.mock('@letschurch/opensearch', () => ({
  client: { cat: { allocation: mocks.allocation } },
}));
vi.mock('./annotate-transcript', () => ({ lockUploadAnnotations: vi.fn() }));
vi.mock('./index-document', () => ({ default: vi.fn() }));

import { getSearchDiskUsedPercent } from './backfill-scripture-refs';

beforeEach(() => {
  mocks.allocation.mockReset();
});

describe('getSearchDiskUsedPercent', () => {
  test('returns the fullest node and ignores rows without disk stats', async () => {
    mocks.allocation.mockResolvedValue({
      body: [
        { node: 'a', 'disk.percent': '62' },
        { node: 'UNASSIGNED' },
        { node: 'b', 'disk.percent': '75' },
      ],
    });

    await expect(getSearchDiskUsedPercent()).resolves.toBe(75);
    expect(mocks.allocation).toHaveBeenCalledWith({ format: 'json' });
  });

  test('throws when no node reports disk usage', async () => {
    mocks.allocation.mockResolvedValue({ body: [{ node: 'UNASSIGNED' }] });

    await expect(getSearchDiskUsedPercent()).rejects.toThrow(
      'no node disk usage',
    );
  });
});
