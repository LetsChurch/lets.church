import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { lcApi } from './lc-api';
import { uploadThumbnail } from './transfer';

vi.mock('./lc-api', () => ({
  lcApi: {
    createThumbnailUpload: vi.fn(),
    finalizeUpload: vi.fn(),
    abortThumbnailUpload: vi.fn(),
  },
}));

const target = {
  s3UploadId: 'mp-1',
  s3UploadKey: 'upload-1/abc',
  partSize: 10_000_000,
  urls: ['https://ingest.example/part-1'],
};

function stubFetch(routes: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const route = Object.entries(routes).find(([prefix]) =>
        url.startsWith(prefix),
      );
      if (!route) {
        throw new TypeError(`unexpected fetch ${url}`);
      }
      return route[1]();
    }),
  );
}

const args = {
  thumbnailUrl: 'https://i9.ytimg.com/vi/abc/maxresdefault.jpg?sqp=x',
  channelId: 'channel-1',
  uploadId: 'upload-1',
  signal: new AbortController().signal,
};

describe('uploadThumbnail', () => {
  beforeEach(() => {
    vi.mocked(lcApi.createThumbnailUpload).mockResolvedValue(target);
    vi.mocked(lcApi.finalizeUpload).mockResolvedValue({ uploadId: 'upload-1' });
    vi.mocked(lcApi.abortThumbnailUpload).mockResolvedValue({
      uploadId: 'upload-1',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test('does nothing without a thumbnail URL', async () => {
    expect(await uploadThumbnail({ ...args, thumbnailUrl: null })).toBeNull();
    expect(lcApi.createThumbnailUpload).not.toHaveBeenCalled();
  });

  test('uploads the image as one part and finalizes it', async () => {
    stubFetch({
      'https://i9.ytimg.com/': () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
      'https://ingest.example/': () =>
        new Response(null, { headers: { etag: '"etag-1"' } }),
    });

    expect(await uploadThumbnail(args)).toBeNull();
    expect(lcApi.createThumbnailUpload).toHaveBeenCalledWith({
      channelId: 'channel-1',
      uploadId: 'upload-1',
      uploadMimeType: 'image/jpeg',
      bytes: 3,
    });
    expect(lcApi.finalizeUpload).toHaveBeenCalledWith({
      channelId: 'channel-1',
      uploadId: 'upload-1',
      s3UploadId: 'mp-1',
      s3UploadKey: 'upload-1/abc',
      s3PartETags: ['etag-1'],
    });
  });

  test('warns without calling the server when YouTube sends a non-image', async () => {
    stubFetch({
      'https://i9.ytimg.com/': () =>
        new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    });

    expect(await uploadThumbnail(args)).toMatch(/thumbnail/);
    expect(lcApi.createThumbnailUpload).not.toHaveBeenCalled();
  });

  test('aborts the server-side upload and warns when the part upload fails', async () => {
    stubFetch({
      'https://i9.ytimg.com/': () =>
        new Response(new Uint8Array([1]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
      'https://ingest.example/': () => new Response(null, { status: 403 }),
    });

    expect(await uploadThumbnail(args)).toMatch(/didn't mirror/);
    expect(lcApi.finalizeUpload).not.toHaveBeenCalled();
    expect(lcApi.abortThumbnailUpload).toHaveBeenCalledWith({
      channelId: 'channel-1',
      uploadId: 'upload-1',
      s3UploadId: 'mp-1',
      s3UploadKey: 'upload-1/abc',
    });
  });
});
