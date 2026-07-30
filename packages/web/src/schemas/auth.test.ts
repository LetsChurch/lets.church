import { describe, expect, it } from 'vitest';

import { loginSchema, registerSchema, usernameSchema } from './auth';

describe('usernameSchema', () => {
  it.each(['bob', 'bob_smith', 'bob-123', 'BobSmith', 'a', "o'brien"])(
    'accepts %s',
    (username) => {
      expect(usernameSchema.safeParse(username).success).toBe(true);
    },
  );

  it('trims surrounding whitespace', () => {
    expect(usernameSchema.parse('  BobSmith  ')).toBe('BobSmith');
  });

  it.each([
    ['contains @ (email-shaped)', 'bob@example.com'],
    ['is exactly an email', 'a@b.co'],
    ['contains a space', 'bob smith'],
    ['contains a tab', 'bob\tsmith'],
    ['contains a newline', 'bob\nsmith'],
    ['is empty', ''],
  ])('rejects a username that %s', (_label, username) => {
    expect(usernameSchema.safeParse(username).success).toBe(false);
  });
});

describe('identity input normalization', () => {
  it('trims login identifiers before lookup', () => {
    expect(
      loginSchema.parse({
        id: '  User@Example.com  ',
        password: 'password',
        hcaptchaToken: 'token',
      }).id,
    ).toBe('User@Example.com');
  });

  it('trims registration emails before normalization', () => {
    expect(
      registerSchema.parse({
        email: '  User@Example.com  ',
        username: 'new_user',
        password: 'a-strong-password',
        fullName: 'New User',
        agreeToTheology: true,
        agreeToTerms: true,
        subscribeNewsletter: false,
        hcaptchaToken: 'token',
      }).email,
    ).toBe('User@Example.com');
  });
});

describe('registerSchema username', () => {
  const base = {
    email: 'new@example.com',
    password: 'a-strong-password',
    fullName: 'New User',
    agreeToTheology: true,
    agreeToTerms: true,
    subscribeNewsletter: false,
    hcaptchaToken: 'token',
  };

  it('rejects an email-shaped username (shadowing guard)', () => {
    expect(
      registerSchema.safeParse({ ...base, username: 'victim@example.com' })
        .success,
    ).toBe(false);
  });

  it('accepts a normal username', () => {
    expect(
      registerSchema.safeParse({ ...base, username: 'new_user' }).success,
    ).toBe(true);
  });
});
