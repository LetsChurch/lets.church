import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  readBoundedRequest,
  readRequestBody,
  RequestBodyTooLargeError,
} from './read-request-body';

function streamedRequest(
  chunks: Uint8Array[],
  cancel = vi.fn(),
  closeAfterChunks = true,
): { request: Request; cancel: Mock } {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (closeAfterChunks) controller.close();
    },
    cancel,
  });

  return {
    request: new Request('https://example.com/trpc?batch=1', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    cancel,
  };
}

describe('readRequestBody', () => {
  it('accepts a body at the exact byte limit', async () => {
    const body = 'exact';
    const request = new Request('https://example.com', {
      method: 'POST',
      body,
    });

    await expect(readRequestBody(request, 5)).resolves.toBe(body);
  });

  it('rejects a declared body over the byte limit without reading it', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      headers: { 'content-length': '6' },
      body: 'small',
    });

    await expect(readRequestBody(request, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
    expect(request.bodyUsed).toBe(false);
  });

  it('rejects a streamed body over the byte limit and cancels the stream', async () => {
    const encoder = new TextEncoder();
    const { request, cancel } = streamedRequest(
      [encoder.encode('1234'), encoder.encode('56')],
      vi.fn(),
      false,
    );

    await expect(readRequestBody(request, 5)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('returns an empty string for an empty body', async () => {
    const request = new Request('https://example.com', { method: 'POST' });

    await expect(readRequestBody(request, 10)).resolves.toBe('');
  });

  it('counts multibyte UTF-8 input by bytes across chunks', async () => {
    const encoder = new TextEncoder();
    const encoded = encoder.encode('éé');
    const { request } = streamedRequest([
      encoded.slice(0, 1),
      encoded.slice(1, 3),
      encoded.slice(3),
    ]);

    await expect(readRequestBody(request, 4)).resolves.toBe('éé');
  });

  it('rejects a multibyte body at max bytes plus one', async () => {
    const encoded = new TextEncoder().encode('ééa');
    const { request } = streamedRequest([encoded]);

    await expect(readRequestBody(request, 4)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });
});

describe('readBoundedRequest', () => {
  it('reconstructs adapter-visible request details and byte length', async () => {
    const abortController = new AbortController();
    const request = new Request('https://example.com/trpc/example?batch=1', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '1',
        'x-request-id': 'request-id',
      },
      body: 'é',
      signal: abortController.signal,
    });

    const reconstructed = await readBoundedRequest(request, 2);

    expect(reconstructed.method).toBe('POST');
    expect(reconstructed.url).toBe(request.url);
    expect(reconstructed.headers.get('content-type')).toBe('application/json');
    expect(reconstructed.headers.get('x-request-id')).toBe('request-id');
    expect(reconstructed.headers.get('content-length')).toBe('2');
    await expect(reconstructed.text()).resolves.toBe('é');

    abortController.abort();
    expect(reconstructed.signal.aborted).toBe(true);
  });
});
