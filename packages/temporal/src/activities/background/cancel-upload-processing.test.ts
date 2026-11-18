import { beforeEach, describe, expect, test, vi } from 'vitest';

type Status = 'RUNNING' | 'CANCELED' | 'COMPLETED';

const mocks = vi.hoisted(() => ({
  record: undefined as { finalizedUploadKey: string | null } | undefined,
  states: [] as Array<{ id: string }>,
  // Per workflow id: the statuses describe() returns, in order (last repeats);
  // missing ids are "not found".
  workflows: new Map<string, Status[]>(),
  cancelled: [] as string[],
  cancelError: undefined as Error | undefined,
  heartbeat: vi.fn(),
  sleep: vi.fn(async () => undefined),
}));

function notFound() {
  const err = new Error('workflow not found');
  err.name = 'WorkflowNotFoundError';
  return err;
}

vi.mock('@letschurch/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: async () => mocks.states }),
    }),
  },
  UploadState: { id: 'id', uploadRecordId: 'uploadRecordId' },
}));

vi.mock('@temporalio/activity', () => ({
  Context: { current: () => ({ heartbeat: mocks.heartbeat }) },
  sleep: mocks.sleep,
}));

vi.mock('./get-finalized-upload-key', () => ({
  findUploadRecord: async () => mocks.record,
}));

vi.mock('../../client', () => ({
  client: Promise.resolve({
    workflow: {
      getHandle: (id: string) => ({
        cancel: async () => {
          if (mocks.cancelError) throw mocks.cancelError;
          if (!mocks.workflows.has(id)) throw notFound();
          mocks.cancelled.push(id);
        },
        describe: async () => {
          const statuses = mocks.workflows.get(id);
          if (!statuses) throw notFound();
          const name = statuses.length > 1 ? statuses.shift()! : statuses[0]!;
          return { status: { name } };
        },
      }),
    },
  }),
}));

import { cancelUploadProcessing } from './cancel-upload-processing';

beforeEach(() => {
  mocks.record = { finalizedUploadKey: 'upload-1/key' };
  mocks.states = [];
  mocks.workflows.clear();
  mocks.cancelled.length = 0;
  mocks.cancelError = undefined;
  mocks.heartbeat.mockClear();
  mocks.sleep.mockClear();
});

describe('cancelUploadProcessing', () => {
  test('cancels processMedia and backup, waiting until they close', async () => {
    mocks.workflows.set('processMedia:upload-1/key', [
      'RUNNING',
      'RUNNING',
      'CANCELED',
    ]);
    mocks.workflows.set('backupToGlacier:upload-1/key', ['COMPLETED']);

    await cancelUploadProcessing('upload-1');

    expect(mocks.cancelled.sort()).toEqual([
      'backupToGlacier:upload-1/key',
      'processMedia:upload-1/key',
    ]);
    // Polled twice while processMedia was still running.
    expect(mocks.sleep).toHaveBeenCalledTimes(2);
    expect(mocks.heartbeat).toHaveBeenCalledWith('processMedia:upload-1/key');
  });

  test('also cancels bulk backups keyed by upload state id', async () => {
    mocks.states = [{ id: 'state-1' }];
    mocks.workflows.set('backupToGlacier:state-1', ['CANCELED']);

    await cancelUploadProcessing('upload-1');

    expect(mocks.cancelled).toEqual(['backupToGlacier:state-1']);
  });

  test('ignores workflows that were never started', async () => {
    await expect(cancelUploadProcessing('upload-1')).resolves.toBeUndefined();
    expect(mocks.sleep).not.toHaveBeenCalled();
  });

  test('skips the key-based ids when the upload never finished uploading', async () => {
    mocks.record = { finalizedUploadKey: null };
    mocks.states = [{ id: 'state-1' }];
    mocks.workflows.set('backupToGlacier:state-1', ['CANCELED']);

    await cancelUploadProcessing('upload-1');

    expect(mocks.cancelled).toEqual(['backupToGlacier:state-1']);
  });

  test('fails (so it is retried) when the cancel request itself fails', async () => {
    mocks.workflows.set('processMedia:upload-1/key', ['RUNNING']);
    mocks.cancelError = new Error('Unavailable');

    await expect(cancelUploadProcessing('upload-1')).rejects.toThrow(
      'Unavailable',
    );
    expect(mocks.sleep).not.toHaveBeenCalled();
  });

  test('stops waiting at the deadline instead of blocking the delete', async () => {
    vi.useFakeTimers();
    try {
      mocks.workflows.set('processMedia:upload-1/key', ['RUNNING']);
      mocks.sleep.mockImplementation(async () => {
        vi.advanceTimersByTime(60_000);
      });

      await cancelUploadProcessing('upload-1');

      // ~5 minutes of 1-minute "sleeps", then gives up.
      expect(mocks.sleep).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
      mocks.sleep.mockReset().mockResolvedValue(undefined);
    }
  });
});
