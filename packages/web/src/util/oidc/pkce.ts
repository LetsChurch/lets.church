import crypto from 'node:crypto';

// Verify an RFC 7636 PKCE code_verifier against the stored code_challenge.
// Only S256 is supported; `plain` is intentionally rejected.
export function verifyPkceS256(
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): boolean {
  if (method !== 'S256') {
    return false;
  }
  // code_verifier must be 43-128 chars of unreserved URI characters.
  if (
    typeof codeVerifier !== 'string' ||
    codeVerifier.length < 43 ||
    codeVerifier.length > 128 ||
    !/^[A-Za-z0-9\-._~]+$/.test(codeVerifier)
  ) {
    return false;
  }
  const computed = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
