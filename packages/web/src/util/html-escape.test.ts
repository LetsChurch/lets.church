import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html-escape';

describe('escapeHtml', () => {
  it('returns empty string for nullish input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml(`"quoted"`)).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('neutralizes an attribute-breakout payload (quotes are escaped)', () => {
    // Used as alt="${escapeHtml(title)}" in the church map popup — a quote must
    // not be able to close the attribute and add an event handler.
    const payload = '" onerror="alert(1)';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('"');
    expect(escaped).toBe('&quot; onerror=&quot;alert(1)');
  });

  it('escapes ampersands before other entities (no double-escaping artifacts)', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});
