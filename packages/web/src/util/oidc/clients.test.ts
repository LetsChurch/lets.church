import { describe, expect, test } from 'vitest';

import {
  filterScope,
  isRegisteredPostLogoutRedirectUri,
  isRegisteredRedirectUri,
  type OidcClient,
} from './clients';

const client: OidcClient = {
  clientId: 'example-app',
  redirectUris: ['https://app.example.com/auth/callback'],
  postLogoutRedirectUris: ['https://app.example.com/'],
  allowedScopes: ['openid', 'profile', 'email', 'offline_access'],
};

describe('isRegisteredRedirectUri', () => {
  test('accepts an exact match', () => {
    expect(
      isRegisteredRedirectUri(client, 'https://app.example.com/auth/callback'),
    ).toBe(true);
  });

  test('rejects a different path', () => {
    expect(
      isRegisteredRedirectUri(client, 'https://app.example.com/auth/callback2'),
    ).toBe(false);
  });

  test('rejects a trailing-slash variant (no normalization)', () => {
    expect(
      isRegisteredRedirectUri(client, 'https://app.example.com/auth/callback/'),
    ).toBe(false);
  });

  test('rejects an attacker-controlled host that prefixes the registered one', () => {
    expect(
      isRegisteredRedirectUri(
        client,
        'https://app.example.com.evil.test/auth/callback',
      ),
    ).toBe(false);
  });

  test('rejects an extra query string', () => {
    expect(
      isRegisteredRedirectUri(
        client,
        'https://app.example.com/auth/callback?x=1',
      ),
    ).toBe(false);
  });
});

describe('isRegisteredPostLogoutRedirectUri', () => {
  test('accepts an exact match', () => {
    expect(
      isRegisteredPostLogoutRedirectUri(client, 'https://app.example.com/'),
    ).toBe(true);
  });

  test('rejects an unregistered uri', () => {
    expect(
      isRegisteredPostLogoutRedirectUri(client, 'https://evil.test/'),
    ).toBe(false);
  });
});

describe('filterScope', () => {
  test('drops scopes the client is not allowed', () => {
    expect(filterScope(client, 'openid profile admin billing')).toBe(
      'openid profile',
    );
  });

  test('always includes openid even if not requested', () => {
    expect(filterScope(client, 'email')).toBe('openid email');
  });

  test('collapses to just openid when nothing else is allowed', () => {
    expect(filterScope(client, 'admin')).toBe('openid');
  });
});
