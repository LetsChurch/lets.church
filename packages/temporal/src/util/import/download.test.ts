import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@temporalio/activity';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));

vi.mock('./safe-url', () => ({
  safeFetch: mocks.safeFetch,
  UnsafeUrlError: class UnsafeUrlError extends Error {},
}));
// Don't actually wait between resumes.
vi.mock('node:timers/promises', () => ({ setTimeout: async () => undefined }));

import { downloadUrl } from './download';
import { UnsafeUrlError } from './safe-url';

const URL_ = 'https://stream.mux.com/abc/highest.mp4';
const FILE = Buffer.from('0123456789abcdefghij'); // 20 bytes

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as never;

/**
 * A body that yields `bytes`, then (optionally) drops the connection a moment
 * later, the way a real socket does once the chunk has been written out.
 */
function body(bytes: Buffer, { drop = false } = {}) {
  let sent = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sent) {
        sent = true;
        if (bytes.length) {
          controller.enqueue(new Uint8Array(bytes));
          return;
        }
      }
      if (drop) {
        await new Promise((r) => setTimeout(r, 20));
        controller.error(new TypeError('terminated'));
      } else {
        controller.close();
      }
    },
  });
}

function full(
  bytes = FILE,
  opts?: {
    drop?: boolean;
    served?: Buffer;
    etag?: string;
    lastModified?: string;
    noLength?: boolean;
  },
) {
  return new Response(body(opts?.served ?? bytes, opts), {
    status: 200,
    headers: {
      ...(opts?.noLength ? {} : { 'content-length': String(bytes.length) }),
      ...(opts?.etag ? { etag: opts.etag } : {}),
      ...(opts?.lastModified ? { 'last-modified': opts.lastModified } : {}),
    },
  });
}

function partial(from: number, opts?: { drop?: boolean; served?: Buffer }) {
  const rest = FILE.subarray(from);
  return new Response(body(opts?.served ?? rest, opts), {
    status: 206,
    headers: {
      'content-range': `bytes ${from}-${FILE.length - 1}/${FILE.length}`,
      'content-length': String(rest.length),
    },
  });
}

function header(call: number, name: string) {
  const init = mocks.safeFetch.mock.calls[call]?.[1] as RequestInit;
  return (init.headers as Record<string, string>)[name];
}
const rangeHeader = (call: number) => header(call, 'Range');

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'download-test-'));
  mocks.safeFetch.mockReset();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('downloadUrl', () => {
  test('downloads in one request when nothing goes wrong', async () => {
    mocks.safeFetch.mockResolvedValueOnce(full());

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(dest.endsWith('.mp4')).toBe(true);
    expect(rangeHeader(0)).toBeUndefined();
  });

  test('resumes from the bytes on disk after a dropped connection', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
      )
      .mockResolvedValueOnce(
        partial(8, { drop: true, served: FILE.subarray(8, 15) }),
      )
      .mockResolvedValueOnce(partial(15));

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(rangeHeader(1)).toBe('bytes=8-');
    expect(rangeHeader(2)).toBe('bytes=15-');
  });

  test('resumes when the connection closes cleanly before the full size', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(full(FILE, { served: FILE.subarray(0, 12) }))
      .mockResolvedValueOnce(partial(12));

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
  });

  test('restarts from scratch when the server ignores Range', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
      )
      .mockResolvedValueOnce(full());

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
  });

  test('gives up after repeated drops that make no progress', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
      )
      .mockImplementation(async () =>
        partial(8, { drop: true, served: Buffer.alloc(0) }),
      );

    await expect(downloadUrl(URL_, dir, log)).rejects.toThrow('terminated');
    // 1 initial + 5 resumes without progress.
    expect(mocks.safeFetch).toHaveBeenCalledTimes(6);
  });

  test('does not resume an HTTP error', async () => {
    mocks.safeFetch.mockResolvedValueOnce(
      new Response('nope', { status: 404, statusText: 'Not Found' }),
    );

    await expect(downloadUrl(URL_, dir, log)).rejects.toThrow('404');
    expect(mocks.safeFetch).toHaveBeenCalledOnce();
  });

  test('enforces the size cap across resumes', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
      )
      .mockResolvedValueOnce(partial(8));

    await expect(
      downloadUrl(URL_, dir, log, undefined, { maxBytes: 12 }),
    ).rejects.toThrow('exceeded the maximum');
  });

  test('asks for identity encoding and guards resumes with If-Range', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8), etag: '"v1"' }),
      )
      .mockResolvedValueOnce(partial(8));

    await downloadUrl(URL_, dir, log);

    expect(header(0, 'Accept-Encoding')).toBe('identity');
    expect(header(1, 'If-Range')).toBe('"v1"');
  });

  test('reconnects after a transient server error on resume', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
      )
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(partial(8));

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(rangeHeader(2)).toBe('bytes=8-');
  });

  test('restarts when the resume range is rejected', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 416 }))
      .mockResolvedValueOnce(full());

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(rangeHeader(2)).toBeUndefined();
  });

  test('restarts when the server misreports the resume range', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
      )
      .mockResolvedValueOnce(partial(3))
      .mockResolvedValueOnce(full());

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(rangeHeader(2)).toBeUndefined();
  });

  test('uses Last-Modified for If-Range when the ETag is weak', async () => {
    const lastModified = 'Sun, 08 Nov 2026 20:00:00 GMT';
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, {
          drop: true,
          served: FILE.subarray(0, 8),
          etag: 'W/"v1"',
          lastModified,
        }),
      )
      .mockResolvedValueOnce(partial(8));

    await downloadUrl(URL_, dir, log);

    expect(header(1, 'If-Range')).toBe(lastModified);
  });

  test('retries a connection error before the transfer starts', async () => {
    mocks.safeFetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(full());

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
  });

  test('never retries a URL the SSRF guard refuses', async () => {
    mocks.safeFetch.mockRejectedValue(new UnsafeUrlError('private address'));

    await expect(downloadUrl(URL_, dir, log)).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    expect(mocks.safeFetch).toHaveBeenCalledOnce();
  });

  test('finishes when a resume says the file is already complete', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, noLength: true, etag: '"v1"' }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 416,
          headers: { 'content-range': `bytes */${FILE.length}` },
        }),
      );

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(mocks.safeFetch).toHaveBeenCalledTimes(2);
  });

  test('learns the full size from a resume when the first response had none', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, {
          drop: true,
          served: FILE.subarray(0, 8),
          noLength: true,
          etag: '"v1"',
        }),
      )
      // Closes cleanly short of the size Content-Range declares.
      .mockResolvedValueOnce(partial(8, { served: FILE.subarray(8, 12) }))
      .mockResolvedValueOnce(partial(12));

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(rangeHeader(2)).toBe('bytes=12-');
  });

  test('stops reconnecting once the activity is cancelled', async () => {
    const controller = new AbortController();
    const current = vi
      .spyOn(Context, 'current')
      .mockReturnValue({ cancellationSignal: controller.signal } as never);
    try {
      mocks.safeFetch.mockImplementationOnce(async () => {
        controller.abort();
        return full(FILE, { drop: true, served: FILE.subarray(0, 8) });
      });

      await expect(downloadUrl(URL_, dir, log)).rejects.toThrow();
      expect(mocks.safeFetch).toHaveBeenCalledOnce();
    } finally {
      current.mockRestore();
    }
  });

  test('does not reconnect for a local disk failure', async () => {
    mocks.safeFetch.mockRejectedValue(
      Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }),
    );

    await expect(downloadUrl(URL_, dir, log)).rejects.toThrow('no space');
    expect(mocks.safeFetch).toHaveBeenCalledOnce();
  });

  test('restarts when the file changed size between connections', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
      )
      .mockResolvedValueOnce(
        new Response(body(Buffer.from('xxxxxxxxxxxxxxxxxxxxxx')), {
          status: 206,
          headers: { 'content-range': 'bytes 8-29/30' },
        }),
      )
      .mockResolvedValueOnce(full());

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(rangeHeader(2)).toBeUndefined();
  });

  test('restarts rather than append a compressed range', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
      )
      .mockResolvedValueOnce(
        new Response(body(FILE.subarray(8)), {
          status: 206,
          headers: {
            'content-range': `bytes 8-${FILE.length - 1}/${FILE.length}`,
            'content-encoding': 'gzip',
          },
        }),
      )
      .mockResolvedValueOnce(full());

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(rangeHeader(2)).toBeUndefined();
  });

  test('restarts instead of resuming when nothing can verify the file', async () => {
    mocks.safeFetch
      .mockResolvedValueOnce(
        full(FILE, { drop: true, served: FILE.subarray(0, 8), noLength: true }),
      )
      .mockResolvedValueOnce(full());

    const dest = await downloadUrl(URL_, dir, log);

    expect(await readFile(dest)).toEqual(FILE);
    expect(rangeHeader(1)).toBeUndefined();
  });

  test('stops at the overall deadline', async () => {
    mocks.safeFetch.mockResolvedValueOnce(
      full(FILE, { drop: true, served: FILE.subarray(0, 8) }),
    );

    await expect(
      downloadUrl(URL_, dir, log, undefined, { maxDurationMs: 1 }),
    ).rejects.toThrow('did not finish');
  });

  test('uses a stall timeout instead of a whole-download timeout', async () => {
    mocks.safeFetch.mockResolvedValueOnce(full());

    await downloadUrl(URL_, dir, log);

    const [, init, opts] = mocks.safeFetch.mock.calls[0]!;
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect((opts as { timeoutMs: number }).timeoutMs).toBeGreaterThan(
      60 * 60 * 1000,
    );
  });
});
