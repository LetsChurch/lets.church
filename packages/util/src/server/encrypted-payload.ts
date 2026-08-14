import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { EncryptedPayload } from './encrypted-payload-types';

export const PASSWORDLESS_EMAIL_ENCRYPTION_KEY_ENV =
  'PASSWORDLESS_EMAIL_ENCRYPTION_KEY';

const VERSION = 1 as const;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type ParsedKey = {
  keyId: string;
  key: Buffer;
};

function invalidKeyConfiguration(): never {
  throw new Error(
    `${PASSWORDLESS_EMAIL_ENCRYPTION_KEY_ENV} must be <key-id>:<32-byte-base64url-key>`,
  );
}

function decodeBase64Url(value: string, bytes: number): Buffer {
  if (!BASE64URL_PATTERN.test(value)) {
    throw new Error('Invalid encrypted payload');
  }

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== bytes || decoded.toString('base64url') !== value) {
    throw new Error('Invalid encrypted payload');
  }
  return decoded;
}

function parseKey(secret: string | undefined): ParsedKey {
  if (!secret) invalidKeyConfiguration();

  const separator = secret.indexOf(':');
  if (separator <= 0 || separator !== secret.lastIndexOf(':')) {
    invalidKeyConfiguration();
  }

  const keyId = secret.slice(0, separator);
  const encodedKey = secret.slice(separator + 1);
  if (!KEY_ID_PATTERN.test(keyId) || !BASE64URL_PATTERN.test(encodedKey)) {
    invalidKeyConfiguration();
  }

  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== KEY_BYTES || key.toString('base64url') !== encodedKey) {
    invalidKeyConfiguration();
  }
  return { keyId, key };
}

function additionalData(version: number, keyId: string): Buffer {
  return Buffer.from(JSON.stringify([version, keyId]));
}
export function validateEncryptedPayloadKey(
  secret = process.env[PASSWORDLESS_EMAIL_ENCRYPTION_KEY_ENV],
): void {
  parseKey(secret);
}

export function encryptPayload(
  plaintext: string,
  secret = process.env[PASSWORDLESS_EMAIL_ENCRYPTION_KEY_ENV],
): EncryptedPayload {
  const { keyId, key } = parseKey(secret);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(additionalData(VERSION, keyId));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    version: VERSION,
    keyId,
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptPayload(
  payload: EncryptedPayload,
  secret = process.env[PASSWORDLESS_EMAIL_ENCRYPTION_KEY_ENV],
): string {
  const { keyId, key } = parseKey(secret);

  try {
    if (
      payload.version !== VERSION ||
      payload.keyId !== keyId ||
      !KEY_ID_PATTERN.test(payload.keyId)
    ) {
      throw new Error('Invalid encrypted payload');
    }

    const nonce = decodeBase64Url(payload.nonce, NONCE_BYTES);
    const tag = decodeBase64Url(payload.tag, TAG_BYTES);
    if (!BASE64URL_PATTERN.test(payload.ciphertext)) {
      throw new Error('Invalid encrypted payload');
    }
    const ciphertext = Buffer.from(payload.ciphertext, 'base64url');
    if (ciphertext.toString('base64url') !== payload.ciphertext) {
      throw new Error('Invalid encrypted payload');
    }

    const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(additionalData(payload.version, payload.keyId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Invalid encrypted payload');
  }
}
