import { describe, expect, it } from 'vitest';

import { htmlToMarkdown } from './html-to-markdown';

describe('htmlToMarkdown', () => {
  it('converts paragraphs to blank-line-separated text', () => {
    expect(htmlToMarkdown('<p>First.</p><p>Second.</p>')).toBe(
      'First.\n\nSecond.',
    );
  });

  it('converts emphasis to Markdown', () => {
    expect(
      htmlToMarkdown('<p><strong>Bold</strong> and <em>italic</em></p>'),
    ).toBe('**Bold** and *italic*');
  });

  it('converts anchors to Markdown links', () => {
    expect(
      htmlToMarkdown('<p>See <a href="https://lets.church">the site</a>.</p>'),
    ).toBe('See [the site](https://lets.church).');
  });

  it('converts list items to bullets', () => {
    expect(htmlToMarkdown('<ul><li>One</li><li>Two</li></ul>')).toBe(
      '- One\n- Two',
    );
  });

  it('converts line breaks', () => {
    expect(htmlToMarkdown('Line one<br>Line two')).toBe('Line one\nLine two');
  });

  it('decodes HTML entities', () => {
    expect(htmlToMarkdown('<p>Father &amp; Son &mdash; one God</p>')).toBe(
      'Father & Son — one God',
    );
  });

  it('drops script and style content', () => {
    expect(
      htmlToMarkdown('<p>Hi</p><script>alert(1)</script><style>a{}</style>'),
    ).toBe('Hi');
  });

  it('passes plain text through unchanged', () => {
    expect(htmlToMarkdown('Just a plain description.')).toBe(
      'Just a plain description.',
    );
  });

  it('returns empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
  });
});
