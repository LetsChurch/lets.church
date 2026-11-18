import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patched: vi.fn((_id: string) => true),
  attempt: 1,
  workflowCancelled: false,
  getFinalizedUploadKey: vi.fn(),
  isUploadDeleted: vi.fn(),
  sendUploadErrorNotification: vi.fn(async () => undefined),
  triggerPagerDutyAlert: vi.fn(async () => undefined),
  executeChild: vi.fn(),
  proxyOptions: [] as Array<{ startToCloseTimeout?: string }>,
  // The rest of a successful pipeline, for the annotate tests.
  getUploadStorageLocation: vi.fn(async () => 'idrive'),
  probe: vi.fn(),
  ensureStorageCapacity: vi.fn(async () => ({
    action: 'proceed',
    storageLocation: 'idrive',
  })),
  transcribe: vi.fn(async () => ({ transcriptJsonKey: 'k/transcript.json' })),
  transcode: vi.fn(async () => undefined),
  createThumbnails: vi.fn(async () => undefined),
  measurePublicUsage: vi.fn(async () => undefined),
  storeTranscriptParagraphs: vi.fn(async () => undefined),
}));

vi.mock('@temporalio/workflow', () => {
  class CancelledFailure extends Error {}
  return {
    ActivityCancellationType: { WAIT_CANCELLATION_COMPLETED: 2 },
    ApplicationFailure: {
      retryable: (message: string) => new Error(message),
      nonRetryable: (message: string) => new Error(message),
    },
    CancellationScope: {
      current: () => ({ consideredCancelled: mocks.workflowCancelled }),
    },
    CancelledFailure,
    executeChild: mocks.executeChild,
    isCancellation: (err: unknown) => err instanceof CancelledFailure,
    patched: mocks.patched,
    proxyActivities: (opts: { startToCloseTimeout?: string }) => {
      mocks.proxyOptions.push(opts);
      return new Proxy(
        {},
        {
          get: (_t, name: string) =>
            (mocks as Record<string, unknown>)[name] ??
            vi.fn(async () => {
              throw new Error(`unexpected activity ${name}`);
            }),
        },
      );
    },
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
const { processMediaWorkflow, mediaTimeoutMinutes } =
  await import('./process-media');

const notFound = new Error('Upload record upload-1 not found');

beforeEach(() => {
  mocks.attempt = 1;
  mocks.workflowCancelled = false;
  mocks.patched.mockImplementation(() => true);
  mocks.getFinalizedUploadKey.mockReset().mockRejectedValue(notFound);
  mocks.isUploadDeleted.mockReset().mockResolvedValue(true);
  mocks.sendUploadErrorNotification.mockClear();
  mocks.triggerPagerDutyAlert.mockClear();
  mocks.executeChild.mockReset().mockResolvedValue(undefined);
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

const probeOf = (durationSeconds: string) => ({
  format: { duration: durationSeconds, format_name: 'mov,mp4' },
  streams: [{ codec_type: 'video' }],
});

describe('mediaTimeoutMinutes', () => {
  test('keeps 180 minutes for ordinary lengths', () => {
    expect(mediaTimeoutMinutes(probeOf('3600') as never)).toBe(180);
  });

  test('scales with long media', () => {
    // 5.7 hours: 342 min × 1.5 + 60.
    expect(mediaTimeoutMinutes(probeOf('20526') as never)).toBe(574);
  });

  test('falls back to 180 minutes when the duration is unknown', () => {
    expect(mediaTimeoutMinutes(probeOf('N/A') as never)).toBe(180);
  });
});

describe('processMediaWorkflow when annotation fails', () => {
  const annotateFailure = new Error('Child Workflow execution failed');

  beforeEach(() => {
    mocks.getFinalizedUploadKey.mockReset().mockResolvedValue('upload-1/key');
    mocks.probe.mockReset().mockResolvedValue(probeOf('20526'));
    mocks.proxyOptions.length = 0;
    mocks.executeChild.mockImplementation(
      async (_wf: unknown, opts: { workflowId: string }) => {
        if (opts.workflowId.startsWith('annotateTranscript:')) {
          throw annotateFailure;
        }
      },
    );
  });

  test('finishes the run, still summarizes and indexes, and pages without emailing', async () => {
    mocks.attempt = 1;
    mocks.isUploadDeleted.mockResolvedValue(false);

    await expect(processMediaWorkflow('upload-1')).resolves.toBeUndefined();

    const children = mocks.executeChild.mock.calls.map(
      ([, opts]) => (opts as { workflowId: string }).workflowId,
    );
    expect(children).toEqual([
      'annotateTranscript:on-transcribe:upload-1/key',
      'summarizeUpload:on-transcribe:upload-1/key',
      'media:upload-1/key',
    ]);
    expect(mocks.triggerPagerDutyAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupKey: 'annotate-transcript:upload-1',
        component: 'annotate-transcript',
      }),
    );
    expect(mocks.sendUploadErrorNotification).not.toHaveBeenCalled();
  });

  test('does not page when the upload was deleted meanwhile', async () => {
    mocks.isUploadDeleted.mockResolvedValue(true);

    await expect(processMediaWorkflow('upload-1')).resolves.toBeUndefined();

    expect(mocks.triggerPagerDutyAlert).not.toHaveBeenCalled();
  });

  test('transcodes, thumbnails and transcribes with time limits scaled to the media length', async () => {
    await processMediaWorkflow('upload-1');

    const scaled = mocks.proxyOptions.filter(
      (o) => o.startToCloseTimeout === '574 minutes',
    );
    // transcode + createThumbnails, and transcribe.
    expect(scaled).toHaveLength(3);
  });

  test('runs started before the patch still fail the run', async () => {
    mocks.patched.mockImplementation(
      (id: string) => id !== 'process-media-annotate-nonfatal-v1',
    );
    mocks.isUploadDeleted.mockResolvedValue(false);

    await expect(processMediaWorkflow('upload-1')).rejects.toThrow(
      'annotate failed',
    );
  });
});
