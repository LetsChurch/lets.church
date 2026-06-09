const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(
      /&([a-z]+);/gi,
      (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match,
    );
}

/**
 * Convert feed-provided HTML (RSS/podcast descriptions) into Markdown that the
 * web app's remark/rehype pipeline can render. The render pipeline drops raw
 * HTML blocks, so HTML descriptions would otherwise render as nothing. Inputs
 * that are already plain text pass through unchanged.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) {
    return '';
  }

  let text = html;

  // Drop elements whose content should never be rendered.
  text = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');

  // Inline emphasis -> Markdown.
  text = text
    .replace(/<\s*(strong|b)\b[^>]*>/gi, '**')
    .replace(/<\s*\/\s*(strong|b)\s*>/gi, '**')
    .replace(/<\s*(em|i)\b[^>]*>/gi, '*')
    .replace(/<\s*\/\s*(em|i)\s*>/gi, '*');

  // Anchors -> [text](href).
  text = text.replace(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, inner) => `[${inner.trim()}](${href})`,
  );

  // List items -> bullet lines.
  text = text.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li\s*>/gi, '');

  // Explicit line breaks.
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Block boundaries -> blank line so paragraphs survive the Markdown parser.
  text = text
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|section|article)\s*>/gi, '\n\n')
    .replace(/<(p|div|h[1-6]|ul|ol|blockquote|section|article)\b[^>]*>/gi, '');

  // Strip any remaining tags.
  text = text.replace(/<[^>]+>/g, '');

  text = decodeEntities(text);

  // Normalize whitespace.
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
