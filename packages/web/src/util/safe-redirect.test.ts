import { describe, expect, it } from 'vitest';

import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/oidc/authorize?x=1', '/oidc/authorize?x=1'],
    ['/path?a=1&b=2#frag', '/path?a=1&b=2#frag'],
    ['/', '/'],
  ])('allows internal path %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'https://evil.example', // absolute external URL
    'http://evil.example',
    '//evil.example', // protocol-relative
    '/\\evil.example', // backslash → resolves off-origin
    '/\\\\evil.example',
    '/\t/evil.example', // tab smuggling
    'evil.example', // no leading slash
    'javascript:alert(1)',
  ])('rejects unsafe redirect %s', (input) => {
    expect(safeRedirect(input)).toBeUndefined();
  });

  it('strips the resolution origin and returns only the path', () => {
    // Even though it resolves against https://lets.church, the returned value is
    // path-only so it can't leak the placeholder origin.
    const result = safeRedirect('/foo');
    expect(result).toBe('/foo');
    expect(result).not.toContain('lets.church');
  });
});
