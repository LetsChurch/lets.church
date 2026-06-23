/**
 * HTML-escape a plain-text value before interpolating it into raw HTML — either
 * element content (e.g. RSS/Atom `content:encoded`) or, importantly, **attribute
 * values** (e.g. `alt="${escapeHtml(title)}"` in the church map popup). Escaping
 * `"` and `'` in addition to `&`/`<`/`>` is what makes it safe in attribute
 * context: a value containing a quote cannot break out of the attribute.
 *
 * Zero-dependency on purpose so it can be used from client components without
 * pulling a sanitizer library into the browser bundle.
 */
export function escapeHtml(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
