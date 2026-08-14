export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large');
    this.name = 'RequestBodyTooLargeError';
  }
}

/** Read a request body while enforcing both declared and streamed byte limits. */
export async function readRequestBody(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

/**
 * Read a bounded request body and rebuild the request for a downstream adapter.
 *
 * The returned request preserves the transport details adapters inspect while
 * replacing the consumed stream with the already-bounded UTF-8 bytes.
 */
export async function readBoundedRequest(
  request: Request,
  maxBytes: number,
): Promise<Request> {
  const body = new TextEncoder().encode(
    await readRequestBody(request, maxBytes),
  );
  const headers = new Headers(request.headers);
  headers.set('content-length', String(body.byteLength));

  return new Request(request.url, {
    method: request.method,
    headers,
    body,
    signal: request.signal,
  });
}
