import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  const step = (name: string) =>
    vi.fn(async () => {
      calls.push(name);
    });
  return {
    calls,
    patched: vi.fn(() => true),
    cancelUploadProcessing: vi.fn(),
    activities: {
      markUploadDeleted: step('markUploadDeleted'),
      markUploadPrivate: step('markUploadPrivate'),
      deleteUploadRecordSearch: step('deleteUploadRecordSearch'),
      deleteUploadRecordS3Objects: step('deleteUploadRecordS3Objects'),
      deleteUploadRecordGlacierBackups: step(
        'deleteUploadRecordGlacierBackups',
      ),
      deleteUploadRecordDb: step('deleteUploadRecordDb'),
    },
  };
});

class CancelledFailure extends Error {}

vi.mock('@temporalio/workflow', () => ({
  isCancellation: (err: unknown) => err instanceof CancelledFailure,
  log: { warn: vi.fn() },
  patched: mocks.patched,
  proxyActivities: () => ({
    ...mocks.activities,
    cancelUploadProcessing: mocks.cancelUploadProcessing,
  }),
}));

import { deleteUploadWorkflow } from './delete-upload';

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.activities.markUploadDeleted.mockImplementation(async () => {
    mocks.calls.push('markUploadDeleted');
  });
  mocks.patched.mockReturnValue(true);
  mocks.cancelUploadProcessing.mockReset().mockImplementation(async () => {
    mocks.calls.push('cancelUploadProcessing');
  });
});

describe('deleteUploadWorkflow', () => {
  test('tombstones, then cancels processing before deleting anything it could write back', async () => {
    await deleteUploadWorkflow('upload-1');

    expect(mocks.calls).toEqual([
      'markUploadDeleted',
      'deleteUploadRecordSearch',
      'cancelUploadProcessing',
      'deleteUploadRecordSearch',
      'deleteUploadRecordS3Objects',
      'deleteUploadRecordGlacierBackups',
      'deleteUploadRecordDb',
    ]);
    expect(mocks.cancelUploadProcessing).toHaveBeenCalledWith('upload-1');
  });

  test('still deletes when cancelling fails', async () => {
    mocks.cancelUploadProcessing.mockRejectedValue(
      new Error('activity not registered'),
    );

    await deleteUploadWorkflow('upload-1');

    expect(mocks.cancelUploadProcessing).toHaveBeenCalledOnce();
    expect(mocks.calls.at(-1)).toBe('deleteUploadRecordDb');
  });

  test('falls back to just hiding the upload when tombstoning fails', async () => {
    mocks.activities.markUploadDeleted.mockRejectedValue(
      new Error('activity not registered'),
    );

    await deleteUploadWorkflow('upload-1');

    expect(mocks.calls[0]).toBe('markUploadPrivate');
    expect(mocks.calls.at(-1)).toBe('deleteUploadRecordDb');
  });

  test('stops deleting when the delete itself is cancelled', async () => {
    const cancelled = new CancelledFailure('cancelled');
    mocks.cancelUploadProcessing.mockRejectedValue(cancelled);

    await expect(deleteUploadWorkflow('upload-1')).rejects.toBe(cancelled);

    expect(mocks.calls).not.toContain('deleteUploadRecordS3Objects');
  });

  test('keeps the old command sequence for runs started before the patch', async () => {
    mocks.patched.mockReturnValue(false);

    await deleteUploadWorkflow('upload-1');

    expect(mocks.cancelUploadProcessing).not.toHaveBeenCalled();
    expect(mocks.calls).toEqual([
      'markUploadPrivate',
      'deleteUploadRecordSearch',
      'deleteUploadRecordS3Objects',
      'deleteUploadRecordGlacierBackups',
      'deleteUploadRecordDb',
    ]);
  });
});
