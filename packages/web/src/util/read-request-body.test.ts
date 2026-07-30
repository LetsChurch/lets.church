import { describe, expect, it } from 'vitest';

import { readRequestBody, RequestBodyTooLargeError } from './read-request-body';

describe('readRequestBody', () => {
  it('reads a body within the byte limit', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: '{"amount":25}',
    });

    await expect(readRequestBody(request, 100)).resolves.toBe('{"amount":25}');
  });

  it('rejects a declared body over the byte limit', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: 'small',
      headers: { 'content-length': '101' },
    });

    await expect(readRequestBody(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it('rejects a streamed body over the byte limit', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: 'a'.repeat(101),
    });

    await expect(readRequestBody(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });
});
