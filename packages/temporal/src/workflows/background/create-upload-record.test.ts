import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  workflowId: 'createUploadRecord:operation-1',
}));

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({ createUploadRecord: mocks.activity }),
  workflowInfo: () => ({ workflowId: mocks.workflowId }),
}));

import { fingerprintUploadRecordCreateData } from '../../client/create-upload-record';
import { createUploadRecordWorkflow } from './create-upload-record';

const data = {
  title: 'Retry-safe upload',
  description: null,
  appUserId: 'user-1',
  channelId: 'channel-1',
  publishedAt: new Date('2026-08-14T12:00:00.000Z'),
};

beforeEach(() => {
  mocks.workflowId = 'createUploadRecord:operation-1';
  mocks.activity.mockReset().mockResolvedValue({ id: 'upload-1' });
});

describe('createUploadRecordWorkflow', () => {
  test('uses the same operation identity and fingerprint across retries', async () => {
    await expect(createUploadRecordWorkflow(data)).resolves.toBe('upload-1');
    await expect(createUploadRecordWorkflow(data)).resolves.toBe('upload-1');

    const expectedInput = {
      data,
      creationOperationId: 'createUploadRecord:operation-1',
      creationRequestFingerprint: fingerprintUploadRecordCreateData(data),
    };
    expect(mocks.activity).toHaveBeenNthCalledWith(1, expectedInput);
    expect(mocks.activity).toHaveBeenNthCalledWith(2, expectedInput);
  });

  test('uses distinct operation identities for distinct workflows', async () => {
    await createUploadRecordWorkflow(data);
    mocks.workflowId = 'createUploadRecord:operation-2';
    await createUploadRecordWorkflow(data);

    expect(
      mocks.activity.mock.calls.map(
        ([input]) => input.creationOperationId as string,
      ),
    ).toEqual([
      'createUploadRecord:operation-1',
      'createUploadRecord:operation-2',
    ]);
  });
});

describe('fingerprintUploadRecordCreateData', () => {
  test('canonicalizes defaults and dates without generated timestamps', () => {
    expect(
      fingerprintUploadRecordCreateData({
        ...data,
        license: undefined,
        publishedAt: '2026-08-14T12:00:00.000Z',
      }),
    ).toBe(fingerprintUploadRecordCreateData(data));

    expect(
      fingerprintUploadRecordCreateData({ ...data, title: 'Changed title' }),
    ).not.toBe(fingerprintUploadRecordCreateData(data));

    expect(
      JSON.parse(
        fingerprintUploadRecordCreateData({
          ...data,
          publishedAt: undefined,
        }),
      ),
    ).toMatchObject({ publishedAt: null });
  });
});
