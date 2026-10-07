import { beforeAll, describe, expect, it, vi } from 'vitest';

let session: typeof import('./session');

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', 'ab'.repeat(32));
  session = await import('./session');
});

describe('MCP session ids', () => {
  it('verifies an id it minted and returns a stable per-session key', () => {
    const id = session.mintMcpSessionId();
    const key = session.verifyMcpSessionId(id);
    expect(key).toEqual(expect.any(String));
    expect(session.verifyMcpSessionId(id)).toBe(key);
    // Visible ASCII only, as Mcp-Session-Id requires.
    expect(id).toMatch(/^[\x21-\x7e]+$/);
  });

  it('mints a different session each time', () => {
    expect(session.mintMcpSessionId()).not.toBe(session.mintMcpSessionId());
  });

  it('rejects tampered, forged and malformed ids', () => {
    const id = session.mintMcpSessionId();
    const [version, issuedAt, , mac] = id.split('.');
    const otherNonce = session.mintMcpSessionId().split('.')[2];
    expect(
      session.verifyMcpSessionId(`${version}.${issuedAt}.${otherNonce}.${mac}`),
    ).toBeNull();
    // Changing any single character — issuedAt, nonce or MAC — invalidates it.
    // Always substitute a *different* character: a fixed replacement would be
    // a no-op whenever the id already has that character there.
    for (let i = 0; i < id.length; i++) {
      if (id[i] === '.') continue;
      const swapped = id[i] === 'A' ? 'B' : 'A';
      expect(
        session.verifyMcpSessionId(id.slice(0, i) + swapped + id.slice(i + 1)),
      ).toBeNull();
    }
    expect(session.verifyMcpSessionId('v1.a.b')).toBeNull();
    expect(session.verifyMcpSessionId('not-a-session')).toBeNull();
    expect(session.verifyMcpSessionId('x'.repeat(500))).toBeNull();
  });

  it('expires ids after the TTL', () => {
    const issued = Date.UTC(2026, 0, 1);
    const id = session.mintMcpSessionId(issued);
    const ttlMs = session.MCP_SESSION_TTL_SECONDS * 1000;
    expect(
      session.verifyMcpSessionId(id, issued + ttlMs - 1000),
    ).not.toBeNull();
    expect(session.verifyMcpSessionId(id, issued + ttlMs + 1000)).toBeNull();
    // Not valid before it was issued either.
    expect(session.verifyMcpSessionId(id, issued - 60_000)).toBeNull();
  });
});
