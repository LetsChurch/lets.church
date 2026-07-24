import { describe, expect, it } from 'vitest';

import { redactSensitive } from './trpc-logger';

describe('redactSensitive', () => {
  it('redacts sensitive keys at the top level', () => {
    expect(redactSensitive({ password: 'hunter2', username: 'bob' })).toEqual({
      password: '[REDACTED]',
      username: 'bob',
    });
  });

  it('redacts nested sensitive keys (the tRPC context.input case)', () => {
    expect(
      redactSensitive({
        context: {
          input: { email: 'a@b.com', password: 'p', hcaptchaToken: 't' },
        },
      }),
    ).toEqual({
      context: {
        input: {
          email: 'a@b.com',
          password: '[REDACTED]',
          hcaptchaToken: '[REDACTED]',
        },
      },
    });
  });

  it('redacts inside arrays', () => {
    expect(
      redactSensitive({ items: [{ token: 'abc' }, { token: 'def' }] }),
    ).toEqual({
      items: [{ token: '[REDACTED]' }, { token: '[REDACTED]' }],
    });
  });

  it('matches keys case-insensitively', () => {
    expect(
      redactSensitive({ Password: 'x', TOKEN: 'y', HCaptcha: 'z' }),
    ).toEqual({
      Password: '[REDACTED]',
      TOKEN: '[REDACTED]',
      HCaptcha: '[REDACTED]',
    });
  });

  it('covers the auth/reset/invitation secret field names', () => {
    expect(
      redactSensitive({
        currentPassword: 'a',
        newPassword: 'b',
        confirmPassword: 'c',
        key: 'reset-key',
        secret: 's',
        cookie: 'sid=...',
      }),
    ).toEqual({
      currentPassword: '[REDACTED]',
      newPassword: '[REDACTED]',
      confirmPassword: '[REDACTED]',
      key: '[REDACTED]',
      secret: '[REDACTED]',
      cookie: '[REDACTED]',
    });
  });

  it('redacts composite secret field names via substring/suffix match', () => {
    expect(
      redactSensitive({
        accessToken: 'a',
        refreshToken: 'b',
        clientSecret: 'c',
        apiKey: 'd',
        passwordHash: 'e',
        signingKey: 'f',
        jwt: 'g',
        csrfToken: 'h',
      }),
    ).toEqual({
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      clientSecret: '[REDACTED]',
      apiKey: '[REDACTED]',
      passwordHash: '[REDACTED]',
      signingKey: '[REDACTED]',
      jwt: '[REDACTED]',
      csrfToken: '[REDACTED]',
    });
  });

  it('does not over-redact ordinary keys that merely look similar', () => {
    // `keyboard`/`monkey-bars` don't end with `key`; `email`/`count` aren't
    // sensitive substrings.
    const input = {
      id: 1,
      email: 'a@b.com',
      count: 2,
      keyboard: 'qwerty',
      description: 'a token of appreciation', // value, not key — not redacted
    };
    expect(redactSensitive(input)).toEqual(input);
  });

  it('leaves non-sensitive primitives and structures untouched', () => {
    const input = { id: 1, nested: { count: 2, name: 'x' }, list: [1, 2, 3] };
    expect(redactSensitive(input)).toEqual(input);
  });

  it('passes through non-object values', () => {
    expect(redactSensitive('hello')).toBe('hello');
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBeNull();
  });
});
