import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patched: vi.fn((_id: string) => true),
  attempt: 1,
  workflowCancelled: false,
  getFinalizedUploadKey: vi.fn(),
  isUploadDeleted: vi.fn(),
  sendUploadErrorNotification: vi.fn(async () => undefined),
  triggerPagerDutyAlert: vi.fn(async () => undefined),
}));

vi.mock('@temporalio/workflow', () => {
  class CancelledFailure extends Error {}
  return {
    ActivityCancellationType: { WAIT_CANCELLATION_COMPLETED: 2 },
    ApplicationFailure: { retryable: vi.fn(), nonRetryable: vi.fn() },
    CancellationScope: {
      current: () => ({ consideredCancelled: mocks.workflowCancelled }),
    },
    CancelledFailure,
    executeChild: vi.fn(),
    isCancellation: (err: unknown) => err instanceof CancelledFailure,
    patched: mocks.patched,
    proxyActivities: () =>
      new Proxy(
        {},
        {
          get: (_t, name: string) =>
            (mocks as Record<string, unknown>)[name] ??
            vi.fn(async () => {
              throw new Error(`unexpected activity ${name}`);
            }),
        },
      ),
    setCurrentDetails: vi.fn(),
    sleep: vi.fn(),
    workflowInfo: () => ({
      attempt: mocks.attempt,
      retryPolicy: { maximumAttempts: 5 },
    }),
  };
});

const { CancelledFailure } =
  (await import('@temporalio/workflow')) as never as {
    CancelledFailure: new (message: string) => Error;
  };
const { processMediaWorkflow } = await import('./process-media');

const notFound = new Error('Upload record upload-1 not found');

beforeEach(() => {
  mocks.attempt = 1;
  mocks.workflowCancelled = false;
  mocks.patched.mockImplementation(() => true);
  mocks.getFinalizedUploadKey.mockReset().mockRejectedValue(notFound);
  mocks.isUploadDeleted.mockReset().mockResolvedValue(true);
  mocks.sendUploadErrorNotification.mockClear();
  mocks.triggerPagerDutyAlert.mockClear();
});

describe('processMediaWorkflow when the upload is deleted', () => {
  test('finishes without failing, retrying, emailing, or paging', async () => {
    mocks.attempt = 5;

    await expect(processMediaWorkflow('upload-1')).resolves.toBeUndefined();

    expect(mocks.isUploadDeleted).toHaveBeenCalledWith('upload-1');
    expect(mocks.sendUploadErrorNotification).not.toHaveBeenCalled();
    expect(mocks.triggerPagerDutyAlert).not.toHaveBeenCalled();
  });

  test('a real failure on the last attempt still emails and pages', async () => {
    mocks.attempt = 5;
    mocks.isUploadDeleted.mockResolvedValue(false);

    await expect(processMediaWorkflow('upload-1')).rejects.toBe(notFound);

    expect(mocks.sendUploadErrorNotification).toHaveBeenCalledOnce();
    expect(mocks.triggerPagerDutyAlert).toHaveBeenCalledOnce();
  });

  test('trusts a deleted-upload failure even when the lookup fails', async () => {
    mocks.attempt = 5;
    mocks.getFinalizedUploadKey.mockRejectedValue(
      Object.assign(new Error('Activity task failed'), {
        cause: { type: 'UploadRecordDeleted' },
      }),
    );
    mocks.isUploadDeleted.mockRejectedValue(new Error('db down'));

    await expect(processMediaWorkflow('upload-1')).resolves.toBeUndefined();

    expect(mocks.triggerPagerDutyAlert).not.toHaveBeenCalled();
  });

  test('a failing existence check never hides a real failure', async () => {
    mocks.attempt = 5;
    mocks.isUploadDeleted.mockRejectedValue(new Error('db down'));

    await expect(processMediaWorkflow('upload-1')).rejects.toBe(notFound);

    expect(mocks.triggerPagerDutyAlert).toHaveBeenCalledOnce();
  });

  test('cancelling this workflow propagates without emailing or paging', async () => {
    mocks.attempt = 5;
    mocks.workflowCancelled = true;
    const cancelled = new CancelledFailure('cancelled');
    mocks.getFinalizedUploadKey.mockRejectedValue(cancelled);

    await expect(processMediaWorkflow('upload-1')).rejects.toBe(cancelled);

    expect(mocks.isUploadDeleted).not.toHaveBeenCalled();
    expect(mocks.sendUploadErrorNotification).not.toHaveBeenCalled();
    expect(mocks.triggerPagerDutyAlert).not.toHaveBeenCalled();
  });

  test('a cancelled child or activity alone is still a failure that pages', async () => {
    mocks.attempt = 5;
    mocks.isUploadDeleted.mockResolvedValue(false);
    const cancelled = new CancelledFailure('child cancelled');
    mocks.getFinalizedUploadKey.mockRejectedValue(cancelled);

    await expect(processMediaWorkflow('upload-1')).rejects.toBe(cancelled);

    expect(mocks.sendUploadErrorNotification).toHaveBeenCalledOnce();
    expect(mocks.triggerPagerDutyAlert).toHaveBeenCalledOnce();
  });

  test('runs started before the patch keep the old behavior', async () => {
    mocks.attempt = 5;
    mocks.patched.mockImplementation(
      (id: string) => id !== 'process-media-stop-when-deleted-v1',
    );

    await expect(processMediaWorkflow('upload-1')).rejects.toBe(notFound);

    expect(mocks.isUploadDeleted).not.toHaveBeenCalled();
    expect(mocks.triggerPagerDutyAlert).toHaveBeenCalledOnce();
  });
});
