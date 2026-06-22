import { describe, expect, test } from 'vitest';

// These exercise real ES256 signing/verification, so they need the OIDC signing
// key. Importing the token module also pulls in @letschurch/db (for the
// code/refresh helpers), which requires DATABASE_URL. Both are present when the
// suite runs inside the web container; on a bare host the suite is skipped.
// Imports are dynamic so the module's import-time env parsing only runs when the
// env is actually present.
const hasEnv =
  !!process.env.OIDC_SIGNING_JWK &&
  !!process.env.OIDC_ISSUER &&
  !!process.env.DATABASE_URL;

describe.skipIf(!hasEnv)('oidc token JWTs', () => {
  test('access token round-trips through verifyAccessToken', async () => {
    const { mintAccessToken, verifyAccessToken } = await import('./tokens');
    const token = await mintAccessToken({
      sub: 'user-1',
      clientId: 'example-app',
      scope: 'openid email',
    });
    const verified = await verifyAccessToken(token);
    expect(verified?.sub).toBe('user-1');
    expect(verified?.scope).toBe('openid email');
  });

  test('verifyAccessToken rejects a tampered token', async () => {
    const { mintAccessToken, verifyAccessToken } = await import('./tokens');
    const token = await mintAccessToken({
      sub: 'user-1',
      clientId: 'example-app',
      scope: 'openid',
    });
    // Mutate a character inside the payload segment so the signature no longer
    // matches the signed content. (Flipping the final signature char is
    // unreliable: its last base64url char carries spare bits.)
    const i = token.indexOf('.') + 3;
    const tampered =
      token.slice(0, i) + (token[i] === 'a' ? 'b' : 'a') + token.slice(i + 1);
    expect(await verifyAccessToken(tampered)).toBeNull();
  });

  test('verifyAccessToken rejects an ID token (wrong token_use/audience)', async () => {
    const { mintIdToken, verifyAccessToken } = await import('./tokens');
    const idToken = await mintIdToken({
      sub: 'user-1',
      clientId: 'example-app',
      authTime: 1_700_000_000,
      nonce: 'n-1',
      claims: {},
    });
    expect(await verifyAccessToken(idToken)).toBeNull();
  });

  test('ID token verifies against the published JWKS and carries claims', async () => {
    const { mintIdToken } = await import('./tokens');
    const { getVerificationKeySet } = await import('./keys');
    const { getIssuer } = await import('./config');
    const { jwtVerify } = await import('jose');

    const idToken = await mintIdToken({
      sub: 'user-9',
      clientId: 'app-1',
      authTime: 1_700_000_000,
      nonce: 'nonce-xyz',
      claims: { email: 'a@b.com', email_verified: true },
    });

    const keySet = await getVerificationKeySet();
    const { payload } = await jwtVerify(idToken, keySet, {
      issuer: getIssuer(),
      audience: 'app-1',
    });

    expect(payload.sub).toBe('user-9');
    expect(payload.nonce).toBe('nonce-xyz');
    expect(payload.auth_time).toBe(1_700_000_000);
    expect(payload.email).toBe('a@b.com');
    expect(payload.email_verified).toBe(true);
  });
});
