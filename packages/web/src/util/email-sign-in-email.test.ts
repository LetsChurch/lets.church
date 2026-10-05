import { afterAll, describe, expect, it, vi } from 'vitest';

const { originalWebUrl } = vi.hoisted(() => {
  const originalWebUrl = process.env.WEB_URL;
  process.env.WEB_URL = 'https://example.test';
  return { originalWebUrl };
});

import { generateEmailSignInEmail } from './email-sign-in-email';

afterAll(() => {
  if (originalWebUrl === undefined) {
    delete process.env.WEB_URL;
  } else {
    process.env.WEB_URL = originalWebUrl;
  }
});

describe('generateEmailSignInEmail', () => {
  it('provides a visible call to action and a linked URL fallback', () => {
    const token = 'sign-in-token';
    const expectedUrl = `https://example.test/auth/email-sign-in?token=${token}`;

    const { html, text } = generateEmailSignInEmail(token);
    const links = [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/g)].filter(
      (match) => match[1]?.includes(`href="${expectedUrl}"`),
    );

    expect(links).toHaveLength(2);
    expect(links[0]?.[1]).toContain('style="background-color:');
    expect(links[0]?.[2]).toBe("Sign in to Let's Church");
    expect(links[1]?.[2]).toBe(expectedUrl);
    expect(text).toContain(expectedUrl);
  });
});
