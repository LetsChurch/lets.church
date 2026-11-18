import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patched: vi.fn((_id: string) => true),
  workflowCancelled: false,
  childResult: vi.fn(),
  isUploadFinalized: vi.fn(async () => false),
  getUploadStorageLocation: vi.fn(async () => 'idrive'),
  importMuxRecording: vi.fn(async () => ({ mediaUploadKey: 'rec-1/key' })),
  deleteMuxAsset: vi.fn(async () => undefined),
  isUploadDeleted: vi.fn(async () => true),
  triggerPagerDutyAlert: vi.fn(async () => undefined),
}));

vi.mock('@temporalio/workflow', () => {
  class CancelledFailure extends Error {}
  return {
    CancelledFailure,
    condition: vi.fn(),
    isCancellation: (err: unknown) => err instanceof CancelledFailure,
    log: { warn: vi.fn() },
    ParentClosePolicy: { ABANDON: 'ABANDON' },
    patched: mocks.patched,
    proxyActivities: () =>
      new Proxy({}, { get: (_t, name: string) => mocks[name as 'patched'] }),
    setHandler: vi.fn(),
    startChild: async () => ({ result: mocks.childResult }),
    // Final attempt: skips the rendition wait, and a failure would page.
    workflowInfo: () => ({ attempt: 5, retryPolicy: { maximumAttempts: 5 } }),
    // Pulled in transitively by process-media.
    ActivityCancellationType: { WAIT_CANCELLATION_COMPLETED: 2 },
    ApplicationFailure: {},
    CancellationScope: {
      current: () => ({ consideredCancelled: mocks.workflowCancelled }),
    },
    executeChild: vi.fn(),
    setCurrentDetails: vi.fn(),
    sleep: vi.fn(),
  };
});

const { CancelledFailure } =
  (await import('@temporalio/workflow')) as never as {
    CancelledFailure: new (message: string) => Error;
  };
const { muxImportRecordingWorkflow } = await import('./mux-import-recording');

const params = { uploadRecordId: 'rec-1', muxAssetId: 'mux-1' };

beforeEach(() => {
  mocks.workflowCancelled = false;
  mocks.patched.mockImplementation(() => true);
  mocks.childResult.mockReset();
  mocks.isUploadDeleted.mockReset().mockResolvedValue(true);
  mocks.deleteMuxAsset.mockReset().mockResolvedValue(undefined);
  mocks.triggerPagerDutyAlert.mockClear();
});

describe('muxImportRecordingWorkflow when the recording is deleted mid-processing', () => {
  test('drops the Mux asset and finishes without paging', async () => {
    mocks.childResult.mockRejectedValue(new CancelledFailure('cancelled'));

    await expect(muxImportRecordingWorkflow(params)).resolves.toBe('rec-1');

    expect(mocks.deleteMuxAsset).toHaveBeenCalledWith('mux-1');
    expect(mocks.triggerPagerDutyAlert).not.toHaveBeenCalled();
  });

  test('still finishes if dropping the Mux asset fails', async () => {
    mocks.childResult.mockRejectedValue(new CancelledFailure('cancelled'));
    mocks.deleteMuxAsset.mockRejectedValue(new Error('mux down'));

    await expect(muxImportRecordingWorkflow(params)).resolves.toBe('rec-1');
    expect(mocks.triggerPagerDutyAlert).not.toHaveBeenCalled();
  });

  test('a cancelled child of a recording that still exists pages and keeps the asset', async () => {
    const cancelled = new CancelledFailure('cancelled by an operator');
    mocks.childResult.mockRejectedValue(cancelled);
    mocks.isUploadDeleted.mockResolvedValue(false);

    await expect(muxImportRecordingWorkflow(params)).rejects.toBe(cancelled);

    expect(mocks.deleteMuxAsset).not.toHaveBeenCalled();
    expect(mocks.triggerPagerDutyAlert).toHaveBeenCalledOnce();
  });

  test('cancelling the import itself keeps the Mux asset', async () => {
    const cancelled = new CancelledFailure('cancelled');
    mocks.workflowCancelled = true;
    mocks.childResult.mockRejectedValue(cancelled);

    await expect(muxImportRecordingWorkflow(params)).rejects.toBe(cancelled);

    expect(mocks.deleteMuxAsset).not.toHaveBeenCalled();
  });

  test('a real processing failure still pages', async () => {
    const failure = new Error('transcode failed');
    mocks.childResult.mockRejectedValue(failure);
    mocks.isUploadDeleted.mockResolvedValue(false);

    await expect(muxImportRecordingWorkflow(params)).rejects.toBe(failure);

    expect(mocks.deleteMuxAsset).not.toHaveBeenCalled();
    expect(mocks.triggerPagerDutyAlert).toHaveBeenCalledOnce();
  });

  test('an import that fails against an already-deleted recording drops the asset quietly', async () => {
    mocks.importMuxRecording.mockRejectedValueOnce(
      new Error('Upload record not found'),
    );

    await expect(muxImportRecordingWorkflow(params)).resolves.toBe('rec-1');

    expect(mocks.deleteMuxAsset).toHaveBeenCalledWith('mux-1');
    expect(mocks.triggerPagerDutyAlert).not.toHaveBeenCalled();
  });

  test('runs started before the patch keep the old behavior', async () => {
    mocks.patched.mockImplementation(
      (id: string) => id !== 'mux-import-stop-when-deleted-v1',
    );
    mocks.childResult.mockRejectedValue(new CancelledFailure('cancelled'));

    await expect(muxImportRecordingWorkflow(params)).rejects.toThrow();

    expect(mocks.isUploadDeleted).not.toHaveBeenCalled();
    expect(mocks.triggerPagerDutyAlert).toHaveBeenCalledOnce();
  });
});
