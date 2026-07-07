import {
  calculateJwkThumbprint,
  createLocalJWKSet,
  importJWK,
  type JWK,
} from 'jose';

import { getRawSigningJwk } from './config';

// All OIDC tokens are signed with ES256 (EC P-256). Satellites verify them via
// the public JWKS endpoint, so the algorithm must be asymmetric.
export const SIGNING_ALG = 'ES256';

type PrivateKey = Awaited<ReturnType<typeof importJWK>>;

type SigningKey = {
  kid: string;
  privateKey: PrivateKey;
  publicJwk: JWK;
};

const parsedJwks: JWK[] = (() => {
  const json: unknown = JSON.parse(getRawSigningJwk());
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length === 0) {
    throw new Error('OIDC_SIGNING_JWK must contain at least one JWK');
  }
  return arr as JWK[];
})();

async function loadKey(jwk: JWK): Promise<SigningKey> {
  const kid = jwk.kid ?? (await calculateJwkThumbprint(jwk));
  const privateKey = await importJWK({ ...jwk, alg: SIGNING_ALG }, SIGNING_ALG);
  // Whitelist only the public EC (P-256) components for the JWKS endpoint, so no
  // private material can ever leak into /jwks.json.
  const publicJwk: JWK = {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    kid,
    alg: SIGNING_ALG,
    use: 'sig',
  };
  return { kid, privateKey, publicJwk };
}

let keysPromise: Promise<SigningKey[]> | null = null;
function getKeys() {
  if (!keysPromise) {
    keysPromise = Promise.all(parsedJwks.map(loadKey));
  }
  return keysPromise;
}

// The active signing key is always the first entry.
export async function getActiveSigningKey(): Promise<SigningKey> {
  const [key] = await getKeys();
  if (!key) {
    throw new Error('No OIDC signing key available');
  }
  return key;
}

export async function getPublicJwks(): Promise<{ keys: JWK[] }> {
  const keys = await getKeys();
  return { keys: keys.map((k) => k.publicJwk) };
}

let resolverPromise: ReturnType<typeof createLocalJWKSet> | null = null;
// Key resolver for verifying tokens we issued (e.g. access tokens at /userinfo).
export async function getVerificationKeySet() {
  if (!resolverPromise) {
    const jwks = await getPublicJwks();
    resolverPromise = createLocalJWKSet(jwks);
  }
  return resolverPromise;
}
