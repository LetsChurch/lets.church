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

  test('opens whole-book references at chapter 1', async () => {
    vi.stubEnv('VITE_LETS_BIBLE_URL', 'https://lets.bible');
    vi.resetModules();
    const { buildLetsBibleUrl } = await import('./bible-url');

    expect(buildLetsBibleUrl({ book: '3John' })).toBe(
      'https://lets.bible/bible/3-john/1',
    );
  });
});

describe('single-chapter books', () => {
  test.each([
    [{ book: 'Jude', verse: 3 }, 'Jude 3', '/jude/1?v=3'],
    [{ book: 'Jude', chapter: 3 }, 'Jude 3', '/jude/1?v=3'],
    [
      { book: 'Phlm', chapter: 1, verse: 17, endVerse: 18 },
      'Philemon 17-18',
      '/philemon/1?v=17',
    ],
    [{ book: 'Jude' }, 'Jude', '/jude/1'],
  ])('%j reads as %s', async (metadata, label, path) => {
    vi.stubEnv('VITE_LETS_BIBLE_URL', 'https://lets.bible');
    vi.resetModules();
    const { buildLetsBibleUrl, formatBibleRef, parseBibleMetadata } =
      await import('./bible-url');

    const meta = parseBibleMetadata(metadata);
    expect(meta && formatBibleRef(meta)).toBe(label);
    expect(meta && buildLetsBibleUrl(meta)).toBe(
      `https://lets.bible/bible${path}`,
    );
  });
});
