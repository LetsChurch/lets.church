import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteFile: vi.fn(),
  keys: [] as Array<string>,
}));

vi.mock('@temporalio/activity', () => ({
  Context: { current: () => ({ heartbeat: vi.fn() }) },
}));
vi.mock('../../storage/locate', () => ({
  uploadRecordLocation: async () => ({
    public: {
      async *listKeys() {
        yield* mocks.keys;
      },
      deleteFile: mocks.deleteFile,
    },
  }),
}));
vi.mock('../../util/logger', () => {
  const mockedLogger = { child: vi.fn(), info: vi.fn() };
  mockedLogger.child.mockReturnValue(mockedLogger);
  return { default: mockedLogger };
});

import deleteOldThumbnails from './delete-old-thumbnails';

beforeEach(() => {
  vi.clearAllMocks();
});

test('deletes only legacy NNNNN.jpg frames, not uploads whose name ends in digits', async () => {
  mocks.keys = [
    'upload-1/00001.jpg',
    'upload-1/00012.jpg',
    'upload-1/thumbnail-AbC12345.jpg',
    'upload-1/screenshot_v1_004.jpg',
    'upload-1/master.m3u8',
  ];

  await deleteOldThumbnails('upload-1');

  expect(mocks.deleteFile.mock.calls.map(([key]) => key)).toEqual([
    'upload-1/00001.jpg',
    'upload-1/00012.jpg',
  ]);
});
