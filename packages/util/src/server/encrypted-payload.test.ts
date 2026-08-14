import { randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  decryptPayload,
  encryptPayload,
  PASSWORDLESS_EMAIL_ENCRYPTION_KEY_ENV,
} from './encrypted-payload';
import type { EncryptedPayload } from './encrypted-payload-types';

const makeSecret = (keyId = 'test-key') =>
  `${keyId}:${randomBytes(32).toString('base64url')}`;

const tamper = (value: string) =>
  `${value.slice(0, -1)}${value.endsWith('A') ? 'B' : 'A'}`;

describe('encrypted payloads', () => {
  it('round-trips plaintext', () => {
    const secret = makeSecret();
    const plaintext = 'https://example.test/sign-in?token=dummy-bearer-token';

    expect(decryptPayload(encryptPayload(plaintext, secret), secret)).toBe(
      plaintext,
    );
  });

  it('uses nondeterministic ciphertext and does not serialize plaintext', () => {
    const secret = makeSecret();
    const plaintext = 'https://example.test/reset?token=dummy-bearer-token';
    const first = encryptPayload(plaintext, secret);
    const second = encryptPayload(plaintext, secret);

    expect(first).not.toEqual(second);
    expect(JSON.stringify(first)).not.toContain(plaintext);
    expect(JSON.stringify(first)).not.toContain('dummy-bearer-token');
  });

  it('rejects a different key', () => {
    const encrypted = encryptPayload('secret', makeSecret('active'));

    expect(() => decryptPayload(encrypted, makeSecret('active'))).toThrow(
      'Invalid encrypted payload',
    );
  });

  it.each(['nonce', 'ciphertext', 'tag'] as const)(
    'rejects a tampered %s',
    (field) => {
      const secret = makeSecret();
      const encrypted = encryptPayload('secret', secret);
      const tampered: EncryptedPayload = {
        ...encrypted,
        [field]: tamper(encrypted[field]),
      };

      expect(() => decryptPayload(tampered, secret)).toThrow(
        'Invalid encrypted payload',
      );
    },
  );

  it('rejects unknown versions and key identifiers', () => {
    const secret = makeSecret('active');
    const encrypted = encryptPayload('secret', secret);

    expect(() =>
      decryptPayload(
        { ...encrypted, version: 2 } as unknown as EncryptedPayload,
        secret,
      ),
    ).toThrow('Invalid encrypted payload');
    expect(() =>
      decryptPayload({ ...encrypted, keyId: 'retired' }, secret),
    ).toThrow('Invalid encrypted payload');
  });

  it('requires a canonical 32-byte base64url key without exposing it', () => {
    vi.stubEnv(PASSWORDLESS_EMAIL_ENCRYPTION_KEY_ENV, '');
    try {
      for (const invalid of [undefined, '', 'key:not-base64', 'key:YWJj']) {
        expect(() => encryptPayload('secret', invalid)).toThrow(
          'PASSWORDLESS_EMAIL_ENCRYPTION_KEY',
        );
        try {
          encryptPayload('secret', invalid);
        } catch (error) {
          if (invalid) expect(String(error)).not.toContain(invalid);
        }
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
