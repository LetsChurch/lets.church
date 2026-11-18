import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  proxyOptions: [] as Array<{ startToCloseTimeout?: string }>,
  activities: {
    getProbe: vi.fn(async () => ({
      format: { duration: '20526', format_name: 'mov,mp4' },
      streams: [{ codec_type: 'video' }],
    })),
    getFinalizedUploadKey: vi.fn(async () => 'upload-1/key'),
    getUploadStorageLocation: vi.fn(async () => 'idrive'),
    createThumbnails: vi.fn(async () => undefined),
    deleteOldThumbnails: vi.fn(async () => undefined),
  },
}));

vi.mock('@temporalio/workflow', () => ({
  // Pulled in transitively by process-media.
  ActivityCancellationType: { WAIT_CANCELLATION_COMPLETED: 2 },
  ApplicationFailure: {},
  CancellationScope: {},
  executeChild: vi.fn(),
  isCancellation: vi.fn(),
  log: { warn: vi.fn() },
  setCurrentDetails: vi.fn(),
  sleep: vi.fn(),
  workflowInfo: vi.fn(),
  patched: () => true,
  proxyActivities: (opts: { startToCloseTimeout?: string }) => {
    mocks.proxyOptions.push(opts);
    return mocks.activities;
  },
}));

const { remakeThumbnailsWorkflow } = await import('./remake-thumbnails');

describe('remakeThumbnailsWorkflow', () => {
  test('gives createThumbnails a time limit scaled to the media length', async () => {
    await remakeThumbnailsWorkflow('upload-1');

    // 5.7 hours: 342 min × 1.5 + 60.
    expect(mocks.proxyOptions).toContainEqual(
      expect.objectContaining({ startToCloseTimeout: '574 minutes' }),
    );
    expect(mocks.activities.createThumbnails).toHaveBeenCalledWith(
      'upload-1',
      'upload-1/key',
      expect.anything(),
      'idrive',
    );
    expect(mocks.activities.deleteOldThumbnails).toHaveBeenCalledWith(
      'upload-1',
    );
  });
});
