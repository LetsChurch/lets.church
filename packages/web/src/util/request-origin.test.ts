import { describe, expect, test } from 'vitest';

import { isAllowedPostOrigin } from './request-origin';

const WEB_URL = 'https://lets.church';

function post(origin: string | null, url = 'http://lets.church/trpc/x') {
  const headers = new Headers({ host: new URL(url).host });
  if (origin !== null) {
    headers.set('origin', origin);
  }
  return new Request(url, { method: 'POST', headers });
}

describe('isAllowedPostOrigin', () => {
  test('allows requests without an Origin header', () => {
    expect(isAllowedPostOrigin(post(null), WEB_URL)).toBe(true);
  });

  test('allows the same host even when the scheme differs behind a proxy', () => {
    expect(isAllowedPostOrigin(post('https://lets.church'), WEB_URL)).toBe(
      true,
    );
  });

  test('allows WEB_URL when the request arrives on an internal host', () => {
    expect(
      isAllowedPostOrigin(
        post('https://lets.church', 'http://web:3000/trpc/x'),
        WEB_URL,
      ),
    ).toBe(true);
  });

  test.each([
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    'moz-extension://2b1c7f0e-8a3b-4d4e-9f5a-0c1d2e3f4a5b',
  ])('allows browser extension origin %s', (origin) => {
    expect(isAllowedPostOrigin(post(origin), WEB_URL)).toBe(true);
  });

  test.each([
    'https://evil.example',
    'https://lets.church.evil.example',
    'https://studio.youtube.com',
    'null',
    'file://',
  ])('rejects foreign origin %s', (origin) => {
    expect(isAllowedPostOrigin(post(origin), WEB_URL)).toBe(false);
  });
});
