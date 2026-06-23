import { describe, expect, it } from 'vitest';
import { isSafeUrl, safeHttpHref } from './safe-url';

describe('safeHttpHref', () => {
  it('returns null for nullish/empty input', () => {
    expect(safeHttpHref(null)).toBeNull();
    expect(safeHttpHref(undefined)).toBeNull();
    expect(safeHttpHref('')).toBeNull();
  });

  it('allows http(s) URLs', () => {
    expect(safeHttpHref('http://example.com')).toBe('http://example.com/');
    expect(safeHttpHref('https://example.com/path?q=1')).toBe(
      'https://example.com/path?q=1',
    );
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'mailto:a@b.com',
    'tel:+1234',
    'ftp://example.com',
    'not a url',
  ])('rejects non-http(s) value %s', (value) => {
    expect(safeHttpHref(value)).toBeNull();
  });
});

describe('isSafeUrl', () => {
  it.each([
    'http://example.com',
    'https://example.com/a/b',
    '/relative/path',
    '#t=5',
    'mailto:a@b.com',
    'tel:+1234',
    '//example.com', // protocol-relative resolves to https (external link, not script)
  ])('allows %s', (value) => {
    expect(isSafeUrl(value)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,x',
    'vbscript:msgbox(1)',
  ])('rejects script-bearing scheme %s', (value) => {
    expect(isSafeUrl(value)).toBe(false);
  });

  it('rejects whitespace/case-smuggled javascript: schemes', () => {
    // The WHATWG URL parser strips tabs/newlines and lowercases the scheme, so
    // these resolve to a real javascript: protocol and are rejected.
    expect(isSafeUrl('java\tscript:alert(1)')).toBe(false);
    expect(isSafeUrl('java\nscript:alert(1)')).toBe(false);
    expect(isSafeUrl(' javascript:alert(1)')).toBe(false);
  });
});
