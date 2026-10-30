import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { BackfillScriptureRefsProgress } from '../../refs';

const mocks = vi.hoisted(() => ({
  backfillScriptureRefsBatch: vi.fn(),
  getBackfillScriptureRefsCount: vi.fn(),
  getSearchDiskUsedPercent: vi.fn(),
  refreshReindexTargets: vi.fn(),
  continueAsNew: vi.fn(),
  sleeps: [] as string[],
  progress: null as null | (() => BackfillScriptureRefsProgress),
}));

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    backfillScriptureRefsBatch: mocks.backfillScriptureRefsBatch,
    getBackfillScriptureRefsCount: mocks.getBackfillScriptureRefsCount,
    getSearchDiskUsedPercent: mocks.getSearchDiskUsedPercent,
    refreshReindexTargets: mocks.refreshReindexTargets,
  }),
  setHandler: (
    _query: unknown,
    handler: () => BackfillScriptureRefsProgress,
  ) => {
    mocks.progress = handler;
  },
  sleep: async (duration: string) => {
    mocks.sleeps.push(duration);
  },
  continueAsNew: mocks.continueAsNew,
}));

import { backfillScriptureRefsWorkflow } from './backfill-scripture-refs';

const done = (processed: number, changed = processed) => ({
  processed,
  changed,
  lastId: null,
  hasMore: false,
});

beforeEach(() => {
  mocks.backfillScriptureRefsBatch.mockReset();
  mocks.getBackfillScriptureRefsCount.mockReset().mockResolvedValue(100);
  mocks.getSearchDiskUsedPercent.mockReset().mockResolvedValue(50);
  mocks.refreshReindexTargets.mockReset();
  mocks.continueAsNew.mockReset();
  mocks.sleeps = [];
  mocks.progress = null;
});

describe('backfillScriptureRefsWorkflow', () => {
  test('defaults to two shards', async () => {
    mocks.backfillScriptureRefsBatch.mockResolvedValue(done(5));

    const result = await backfillScriptureRefsWorkflow({});

    expect(mocks.backfillScriptureRefsBatch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ processed: 10, changed: 10 });
    expect(mocks.refreshReindexTargets).toHaveBeenCalledWith('media');
  });

  test('pauses while OpenSearch disk usage is at or above the limit', async () => {
    mocks.getSearchDiskUsedPercent
      .mockResolvedValueOnce(85)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(79);
    mocks.backfillScriptureRefsBatch.mockResolvedValue(done(3));

    await backfillScriptureRefsWorkflow({});

    expect(mocks.sleeps).toEqual(['5 minutes', '5 minutes']);
    expect(mocks.backfillScriptureRefsBatch).toHaveBeenCalledTimes(2);
    expect(mocks.progress?.()).toMatchObject({
      diskPercent: 79,
      paused: false,
      processed: 6,
    });
  });

  test('reports the pause through the progress query', async () => {
    let seen: BackfillScriptureRefsProgress | undefined;
    mocks.getSearchDiskUsedPercent
      .mockResolvedValueOnce(90)
      .mockImplementationOnce(async () => {
        seen = mocks.progress?.();
        return 10;
      });
    mocks.backfillScriptureRefsBatch.mockResolvedValue(done(1));

    await backfillScriptureRefsWorkflow({ maxDiskPercent: 75 });

    expect(seen).toMatchObject({ diskPercent: 90, paused: true });
  });

  test('carries the disk limit across continue-as-new', async () => {
    mocks.backfillScriptureRefsBatch.mockResolvedValue({
      processed: 50,
      changed: 1,
      lastId: 'x',
      hasMore: true,
    });
    mocks.continueAsNew.mockRejectedValue(new Error('continued'));

    await expect(
      backfillScriptureRefsWorkflow({ shards: 2, maxDiskPercent: 70 }),
    ).rejects.toThrow('continued');

    expect(mocks.continueAsNew).toHaveBeenCalledWith(
      expect.objectContaining({ shards: 2, maxDiskPercent: 70 }),
    );
  });
});
