import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createUploadRecord: vi.fn(),
  downloadFromUrl: vi.fn(),
  mkdirp: vi.fn(),
  putFile: vi.fn(),
  putFileMultipart: vi.fn(),
  rimraf: vi.fn(),
  updateUploadRecord: vi.fn(),
  uuid: vi.fn(),
  workflowId: 'importMedia:source:item:run-1',
}));

vi.mock('@letschurch/s3/ingest', () => ({
  ingestS3: {
    putFile: mocks.putFile,
    putFileMultipart: mocks.putFileMultipart,
  },
}));
vi.mock('@temporalio/activity', () => ({
  Context: {
    current: () => ({
      heartbeat: vi.fn(),
      info: { workflowExecution: { workflowId: mocks.workflowId } },
    }),
  },
}));
vi.mock('mkdirp', () => ({ mkdirp: mocks.mkdirp }));
vi.mock('rimraf', () => ({ rimraf: mocks.rimraf }));
vi.mock('uuid', () => ({ v4: mocks.uuid }));
vi.mock('../../client', () => ({
  createUploadRecord: mocks.createUploadRecord,
  updateUploadRecord: mocks.updateUploadRecord,
}));
vi.mock('../../util/import', () => ({
  downloadFromUrl: mocks.downloadFromUrl,
}));
vi.mock('../../util/logger', () => {
  const logger = {
    child: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return { default: logger };
});

import importMedia from './import-media';

const data = {
  title: 'Imported media',
  appUserId: 'user-1',
  channelId: 'channel-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.workflowId = 'importMedia:source:item:run-1';
  let nextUuid = 0;
  mocks.uuid.mockImplementation(() => `uuid-${++nextUuid}`);
  mocks.downloadFromUrl.mockResolvedValue({
    mediaPath: '/tmp/import/media.mp4',
    thumbnailPath: null,
  });
  mocks.mkdirp.mockResolvedValue(undefined);
  mocks.rimraf.mockResolvedValue(undefined);
  mocks.putFileMultipart.mockResolvedValue(undefined);
  mocks.updateUploadRecord.mockResolvedValue(undefined);

  const uploadIds = new Map<string, string>();
  mocks.createUploadRecord.mockImplementation(
    async (_data: unknown, creationOperationId: string) => {
      let uploadId = uploadIds.get(creationOperationId);
      if (!uploadId) {
        uploadId = `upload-${uploadIds.size + 1}`;
        uploadIds.set(creationOperationId, uploadId);
      }
      return uploadId;
    },
  );
});

describe('importMedia upload creation retries', () => {
  test('reuses one upload after object finalization fails and separates a new import', async () => {
    mocks.putFileMultipart.mockRejectedValueOnce(
      new Error('lost acknowledgement after multipart upload'),
    );

    await expect(
      importMedia('https://example.test/media', data),
    ).rejects.toThrow('lost acknowledgement');
    await expect(
      importMedia('https://example.test/media', data),
    ).resolves.toMatchObject({ uploadRecordId: 'upload-1' });

    expect(mocks.createUploadRecord).toHaveBeenNthCalledWith(
      1,
      data,
      'importMedia:source:item:run-1',
    );
    expect(mocks.createUploadRecord).toHaveBeenNthCalledWith(
      2,
      data,
      'importMedia:source:item:run-1',
    );
    expect(mocks.updateUploadRecord).toHaveBeenCalledWith(
      'upload-1',
      expect.objectContaining({
        finalizedUploadKey: expect.stringMatching(/^upload-1\//),
      }),
    );

    mocks.workflowId = 'importMedia:source:item:run-2';
    await expect(
      importMedia('https://example.test/media', data),
    ).resolves.toMatchObject({ uploadRecordId: 'upload-2' });

    expect(mocks.createUploadRecord).toHaveBeenLastCalledWith(
      data,
      'importMedia:source:item:run-2',
    );
    expect(mocks.updateUploadRecord).toHaveBeenLastCalledWith(
      'upload-2',
      expect.objectContaining({
        finalizedUploadKey: expect.stringMatching(/^upload-2\//),
      }),
    );
  });
});
