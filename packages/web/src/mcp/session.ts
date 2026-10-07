import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

// Stateless MCP session ids. The server mints one on `initialize` and the
// client echoes it in `Mcp-Session-Id` on every later request (MCP Streamable
// HTTP). We keep no session table: the id is `v1.<issuedAt>.<nonce>.<mac>`, an
// HMAC over the rest, so any pod can verify it. Its only job is to give each
// MCP client its own rate-limit bucket — it carries no identity or authority.

const { JWT_SECRET } = z.object({ JWT_SECRET: z.string() }).parse(process.env);

// Domain-separated from every other JWT_SECRET use (session cookies sign with
// the hex-decoded secret; rate-limit ids HMAC with the raw string), so an MCP
// session id can never be confused with or forged from another token.
const sessionKey = createHmac('sha256', Buffer.from(JWT_SECRET, 'hex'))
  .update('lc-mcp-session-id:v1')
  .digest();

/** Sessions expire so a leaked id stops working; clients just re-initialize. */
export const MCP_SESSION_TTL_SECONDS = 24 * 60 * 60;

const VERSION = 'v1';

function mac(payload: string): string {
  return createHmac('sha256', sessionKey)
    .update(payload)
    .digest('base64url')
    .slice(0, 32);
}

export function mintMcpSessionId(now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000).toString(36);
  const nonce = randomBytes(16).toString('base64url');
  const payload = `${VERSION}.${issuedAt}.${nonce}`;
  return `${payload}.${mac(payload)}`;
}

/**
 * Returns the session's nonce (a stable per-session key) for a valid, unexpired
 * id, or null for anything forged, malformed, or expired.
 */
export function verifyMcpSessionId(
  sessionId: string,
  now = Date.now(),
): string | null {
  if (sessionId.length > 128) return null;
  const parts = sessionId.split('.');
  if (parts.length !== 4) return null;
  const [version, issuedAt, nonce, signature] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (version !== VERSION) return null;

  const expected = Buffer.from(mac(`${version}.${issuedAt}.${nonce}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  const issuedAtSeconds = Number.parseInt(issuedAt, 36);
  const ageSeconds = Math.floor(now / 1000) - issuedAtSeconds;
  if (
    !Number.isFinite(issuedAtSeconds) ||
    ageSeconds < 0 ||
    ageSeconds > MCP_SESSION_TTL_SECONDS
  ) {
    return null;
  }
  return nonce;
}
