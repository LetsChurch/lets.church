import { afterEach, describe, expect, it, vi } from 'vitest';

import { doMultipartUpload } from './multipart-upload';

class TestProgressEvent extends Event {
  readonly loaded = 0;
  readonly total = 0;
}

class FailingXMLHttpRequest extends EventTarget {
  static sendCount = 0;

  readonly upload = new EventTarget();

  abort() {
    this.dispatchEvent(new TestProgressEvent('abort'));
  }

  getResponseHeader() {
    return null;
  }

  open() {}

  send() {
    FailingXMLHttpRequest.sendCount += 1;
    queueMicrotask(() => {
      this.dispatchEvent(new TestProgressEvent('error'));
      this.dispatchEvent(new TestProgressEvent('loadend'));
    });
  }
}

describe('doMultipartUpload', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('wraps a failed part upload in a descriptive Error', async () => {
    vi.useFakeTimers();
    FailingXMLHttpRequest.sendCount = 0;
    vi.stubGlobal('XMLHttpRequest', FailingXMLHttpRequest);

    const upload = doMultipartUpload(
      new Blob(['video']) as File,
      ['https://uploads.example.test/part-1'],
      5,
    );
    const rejection = upload.catch((error: unknown) => error);

    await vi.runAllTimersAsync();
    await expect(rejection).resolves.toMatchObject({
      message: 'Failed to upload part 1',
      cause: expect.any(TestProgressEvent),
    });
    expect(FailingXMLHttpRequest.sendCount).toBe(6);
  });
});
