import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getScheduledPublish: vi.fn(),
  publishScheduledUpload: vi.fn(),
  indexDocument: vi.fn(),
  // Each condition() call: resolve true (signalled) or false (timed out).
  conditionResults: [] as boolean[],
  conditionTimeouts: [] as number[],
  signalHandler: null as null | (() => void),
}));

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    getScheduledPublish: mocks.getScheduledPublish,
    publishScheduledUpload: mocks.publishScheduledUpload,
    indexDocument: mocks.indexDocument,
  }),
  setHandler: (_signal: unknown, handler: () => void) => {
    mocks.signalHandler = handler;
  },
  condition: async (_fn: () => boolean, timeout: number) => {
    mocks.conditionTimeouts.push(timeout);
    const signalled = mocks.conditionResults.shift() ?? false;
    if (signalled) mocks.signalHandler?.();
    return signalled;
  },
}));

import { scheduledPublishUploadWorkflow } from './scheduled-publish';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const LATER = '2026-10-20T09:00:00.000Z';
const MUCH_LATER = '2026-10-21T09:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  mocks.getScheduledPublish.mockReset();
  mocks.publishScheduledUpload.mockReset().mockResolvedValue(true);
  mocks.indexDocument.mockReset();
  mocks.conditionResults = [];
  mocks.conditionTimeouts = [];
  mocks.signalHandler = null;
});

describe('scheduledPublishUploadWorkflow', () => {
  test('sleeps until the scheduled time, publishes, reindexes, and exits', async () => {
    mocks.getScheduledPublish
      .mockResolvedValueOnce(LATER)
      .mockResolvedValueOnce(null);

    await scheduledPublishUploadWorkflow('upload-1');

    expect(mocks.conditionTimeouts).toEqual([Date.parse(LATER) - NOW]);
    expect(mocks.publishScheduledUpload).toHaveBeenCalledWith(
      'upload-1',
      LATER,
    );
    expect(mocks.indexDocument).toHaveBeenCalledWith('media', 'upload-1');
  });

  test('re-reads the schedule when signalled and uses the new time', async () => {
    mocks.getScheduledPublish
      .mockResolvedValueOnce(LATER)
      .mockResolvedValueOnce(MUCH_LATER)
      .mockResolvedValueOnce(null);
    mocks.conditionResults = [true, false];

    await scheduledPublishUploadWorkflow('upload-1');

    expect(mocks.conditionTimeouts).toEqual([
      Date.parse(LATER) - NOW,
      Date.parse(MUCH_LATER) - NOW,
    ]);
    expect(mocks.publishScheduledUpload).toHaveBeenCalledTimes(1);
    expect(mocks.publishScheduledUpload).toHaveBeenCalledWith(
      'upload-1',
      MUCH_LATER,
    );
  });

  test('exits without publishing when the schedule is cleared', async () => {
    mocks.getScheduledPublish
      .mockResolvedValueOnce(LATER)
      .mockResolvedValueOnce(null);
    mocks.conditionResults = [true];

    await scheduledPublishUploadWorkflow('upload-1');

    expect(mocks.publishScheduledUpload).not.toHaveBeenCalled();
    expect(mocks.indexDocument).not.toHaveBeenCalled();
  });

  test('publishes immediately when the time has already passed', async () => {
    mocks.getScheduledPublish
      .mockResolvedValueOnce('2026-10-19T11:00:00.000Z')
      .mockResolvedValueOnce(null);

    await scheduledPublishUploadWorkflow('upload-1');

    expect(mocks.conditionTimeouts).toEqual([]);
    expect(mocks.publishScheduledUpload).toHaveBeenCalledTimes(1);
  });

  test('skips the reindex when the guarded publish matched nothing', async () => {
    mocks.getScheduledPublish
      .mockResolvedValueOnce(LATER)
      .mockResolvedValueOnce(null);
    mocks.publishScheduledUpload.mockResolvedValue(false);

    await scheduledPublishUploadWorkflow('upload-1');

    expect(mocks.indexDocument).not.toHaveBeenCalled();
  });
});
