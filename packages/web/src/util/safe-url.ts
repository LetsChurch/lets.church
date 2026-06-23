// Only http(s) URLs are safe to place into an href that a user can click.
// `javascript:`, `data:`, `vbscript:`, etc. can execute script in the page
// origin and must never reach the DOM.
export function safeHttpHref(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  return parsed.toString();
}

// Schemes that are safe to keep as an `href`/`src` in HTML we render from
// user-authored Markdown. `javascript:`, `data:`, `vbscript:`, etc. are not.
const SAFE_MARKDOWN_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Whether a URL is safe to keep as an `href`/`src` in HTML rendered from
 * user-authored Markdown.
 *
 * Parses with the WHATWG `URL` API rather than a scheme regex: the parser
 * strips ASCII tabs/newlines and lowercases the scheme before we inspect it, so
 * smuggling tricks like `java\tscript:` or `JAVASCRIPT:` resolve to a real
 * `javascript:` protocol and are rejected. Relative paths and in-page anchors
 * (e.g. the `#t=5` timestamp links) are resolved against a base, so they inherit
 * the safe `https:` protocol and are allowed.
 */
export function isSafeUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value, 'https://lets.church');
  } catch {
    return false;
  }
  return SAFE_MARKDOWN_PROTOCOLS.has(parsed.protocol);
}
