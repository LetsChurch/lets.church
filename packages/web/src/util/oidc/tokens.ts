import crypto from 'node:crypto';
import { db, OidcAuthorizationCode, OidcRefreshToken } from '@letschurch/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  getIssuer,
  ID_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './config';
import {
  getActiveSigningKey,
  getVerificationKeySet,
  SIGNING_ALG,
} from './keys';

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Tokens are stored only as SHA-256 hashes; the raw value lives only in the
// client's possession.
function hashToken(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('base64url');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// JWTs (ID token + access token)
// ---------------------------------------------------------------------------

export async function mintIdToken(params: {
  sub: string;
  clientId: string;
  authTime: number;
  nonce: string | null;
  claims: Record<string, unknown>;
}): Promise<string> {
  const { kid, privateKey } = await getActiveSigningKey();
  const iat = nowSeconds();
  const payload: Record<string, unknown> = {
    ...params.claims,
    auth_time: params.authTime,
  };
  if (params.nonce) {
    payload.nonce = params.nonce;
  }
  return new SignJWT(payload)
    .setProtectedHeader({ alg: SIGNING_ALG, kid })
    .setIssuer(getIssuer())
    .setSubject(params.sub)
    .setAudience(params.clientId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ID_TOKEN_TTL_SECONDS)
    .sign(privateKey);
}

export async function mintAccessToken(params: {
  sub: string;
  clientId: string;
  scope: string;
}): Promise<string> {
  const { kid, privateKey } = await getActiveSigningKey();
  const iat = nowSeconds();
  const issuer = getIssuer();
  // Audience is the issuer itself: the access token is consumed by our own
  // /userinfo endpoint. `token_use` distinguishes it from ID tokens.
  return new SignJWT({
    token_use: 'access',
    client_id: params.clientId,
    scope: params.scope,
  })
    .setProtectedHeader({ alg: SIGNING_ALG, kid, typ: 'at+jwt' })
    .setIssuer(issuer)
    .setSubject(params.sub)
    .setAudience(issuer)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<{
  sub: string;
  scope: string;
} | null> {
  try {
    const keySet = await getVerificationKeySet();
    const issuer = getIssuer();
    const { payload } = await jwtVerify(token, keySet, {
      issuer,
      audience: issuer,
      algorithms: [SIGNING_ALG],
    });
    if (payload.token_use !== 'access' || typeof payload.sub !== 'string') {
      return null;
    }
    return {
      sub: payload.sub,
      scope: typeof payload.scope === 'string' ? payload.scope : '',
    };
  } catch {
    return null;
  }
}

// Verify an id token presented as `id_token_hint` at the end-session endpoint.
// We only need to confirm WE signed it and for whom — NOT that it's still
// unexpired: id tokens live 10 minutes but a logout can happen days into a
// session, so expiry is intentionally ignored (per the OIDC RP-initiated logout
// spec, id_token_hint is a hint and may be expired). Returns the subject, or
// null if the token isn't a valid token we issued.
const HINT_CLOCK_TOLERANCE_SECONDS = 100 * 365 * 24 * 60 * 60; // 100 years

export async function verifyIdTokenHint(token: string): Promise<string | null> {
  try {
    const keySet = await getVerificationKeySet();
    const { payload } = await jwtVerify(token, keySet, {
      issuer: getIssuer(),
      algorithms: [SIGNING_ALG],
      clockTolerance: HINT_CLOCK_TOLERANCE_SECONDS,
    });
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Authorization codes (opaque, single-use, hashed at rest)
// ---------------------------------------------------------------------------

export async function mintAuthorizationCode(params: {
  appUserId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  nonce: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  authTime: number;
}): Promise<string> {
  const code = randomToken();
  await db.insert(OidcAuthorizationCode).values({
    codeHash: hashToken(code),
    appUserId: params.appUserId,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    scope: params.scope,
    nonce: params.nonce,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    authTime: new Date(params.authTime * 1000),
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
  });
  return code;
}

export type ConsumedCode = typeof OidcAuthorizationCode.$inferSelect;

// Atomically claim an authorization code: the UPDATE only matches an unconsumed,
// unexpired row, so a replayed code returns null. Client/redirect binding is
// checked after the claim.
export async function consumeAuthorizationCode(
  rawCode: string,
  clientId: string,
  redirectUri: string,
): Promise<ConsumedCode | null> {
  const [row] = await db
    .update(OidcAuthorizationCode)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(OidcAuthorizationCode.codeHash, hashToken(rawCode)),
        isNull(OidcAuthorizationCode.consumedAt),
        gt(OidcAuthorizationCode.expiresAt, new Date()),
      ),
    )
    .returning();

  if (!row) {
    return null;
  }
  if (row.clientId !== clientId || row.redirectUri !== redirectUri) {
    return null;
  }
  return row;
}

// ---------------------------------------------------------------------------
// Refresh tokens (opaque, hashed, rotating, with reuse detection)
// ---------------------------------------------------------------------------

export async function mintRefreshToken(params: {
  appUserId: string;
  clientId: string;
  scope: string;
  authTime: number;
  familyId?: string;
}): Promise<string> {
  const token = randomToken();
  await db.insert(OidcRefreshToken).values({
    tokenHash: hashToken(token),
    familyId: params.familyId ?? crypto.randomUUID(),
    appUserId: params.appUserId,
    clientId: params.clientId,
    scope: params.scope,
    authTime: new Date(params.authTime * 1000),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });
  return token;
}

async function revokeFamily(familyId: string) {
  await db
    .update(OidcRefreshToken)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(OidcRefreshToken.familyId, familyId),
        isNull(OidcRefreshToken.revokedAt),
      ),
    );
}

export type RefreshRotation =
  | { ok: true; appUserId: string; scope: string; authTime: number }
  | { ok: false; reason: 'invalid' | 'reuse' };

// Rotate a refresh token: validate, mark the presented token rotated, and return
// the context needed to mint a successor in the same family. Presenting an
// already-rotated/revoked token is treated as theft and revokes the whole
// family.
export async function rotateRefreshToken(
  rawToken: string,
  clientId: string,
): Promise<{ rotation: RefreshRotation; newRefreshToken?: string }> {
  const row = await db.query.OidcRefreshToken.findFirst({
    where: eq(OidcRefreshToken.tokenHash, hashToken(rawToken)),
  });

  if (!row || row.clientId !== clientId) {
    return { rotation: { ok: false, reason: 'invalid' } };
  }

  if (row.revokedAt || row.rotatedAt) {
    await revokeFamily(row.familyId);
    return { rotation: { ok: false, reason: 'reuse' } };
  }

  if (row.expiresAt <= new Date()) {
    return { rotation: { ok: false, reason: 'invalid' } };
  }

  // Atomically claim this token for rotation; lose the race -> treat as reuse.
  const [claimed] = await db
    .update(OidcRefreshToken)
    .set({ rotatedAt: new Date() })
    .where(
      and(
        eq(OidcRefreshToken.id, row.id),
        isNull(OidcRefreshToken.rotatedAt),
        isNull(OidcRefreshToken.revokedAt),
      ),
    )
    .returning();

  if (!claimed) {
    await revokeFamily(row.familyId);
    return { rotation: { ok: false, reason: 'reuse' } };
  }

  const authTime = Math.floor(claimed.authTime.getTime() / 1000);
  const newRefreshToken = await mintRefreshToken({
    appUserId: claimed.appUserId,
    clientId,
    scope: claimed.scope,
    authTime,
    familyId: claimed.familyId,
  });

  return {
    rotation: {
      ok: true,
      appUserId: claimed.appUserId,
      scope: claimed.scope,
      authTime,
    },
    newRefreshToken,
  };
}
