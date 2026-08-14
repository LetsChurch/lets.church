import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const logger = {
    child: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };
  logger.child.mockReturnValue(logger);

  return {
    headObject: vi.fn(),
    logger,
    mkdirp: vi.fn(),
    rimraf: vi.fn(),
    streamObjectToFile: vi.fn(),
  };
});

vi.mock('@letschurch/s3/ingest', () => ({
  ingestS3: {
    headObject: mocks.headObject,
    streamObjectToFile: mocks.streamObjectToFile,
  },
}));
vi.mock('@temporalio/activity', () => ({
  Context: {
    current: () => ({
      cancellationSignal: new AbortController().signal,
      heartbeat: vi.fn(),
    }),
  },
}));
vi.mock('mkdirp', () => ({ mkdirp: mocks.mkdirp }));
vi.mock('rimraf', () => ({ rimraf: mocks.rimraf }));
vi.mock('../../util/ffmpeg', () => ({ runFfprobe: vi.fn() }));
vi.mock('../../util/logger', () => ({ default: mocks.logger }));
vi.mock('../../util/temporal', () => ({ updateUploadRecord: vi.fn() }));
vi.mock('../../util/zod', () => ({ ffprobeSchema: { parse: vi.fn() } }));

import probe from './probe';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logger.child.mockReturnValue(mocks.logger);
  mocks.mkdirp.mockResolvedValue(undefined);
  mocks.rimraf.mockResolvedValue(undefined);
});

describe('probe S3 metadata lookup', () => {
  test('propagates operational head failures for Temporal retry', async () => {
    const error = Object.assign(new Error('unavailable'), {
      name: 'ServiceUnavailable',
    });
    mocks.headObject.mockRejectedValueOnce(error);

    await expect(probe('upload-record-id', 'key')).rejects.toBe(error);
    expect(mocks.streamObjectToFile).not.toHaveBeenCalled();
    expect(mocks.rimraf).toHaveBeenCalledTimes(1);
  });

  test('rejects metadata without a usable ContentLength', async () => {
    mocks.headObject.mockResolvedValueOnce({});

    await expect(probe('upload-record-id', 'key')).rejects.toThrow(
      'Invalid uploadSizeBytes',
    );
    expect(mocks.streamObjectToFile).not.toHaveBeenCalled();
  });
});
