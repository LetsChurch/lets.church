import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildLetsBibleUrl', () => {
  test('defaults scripture references to the public lets.bible origin', async () => {
    vi.stubEnv('VITE_LETS_BIBLE_URL', undefined);
    vi.resetModules();
    // Re-import after clearing Vite's module cache so the module-level default
    // is evaluated with the production variable genuinely absent.
    const { buildLetsBibleUrl } = await import('./bible-url');

    expect(buildLetsBibleUrl({ book: 'John', chapter: 3, verse: 16 })).toBe(
      'https://lets.bible/bible/john/3?v=16',
    );
  });
});
