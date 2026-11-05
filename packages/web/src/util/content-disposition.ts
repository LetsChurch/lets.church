import sanitizeFilename from 'sanitize-filename';

/**
 * `Content-Disposition: attachment` for a generated download. `filename` is the
 * ASCII fallback for old clients; `filename*` carries the real (possibly
 * non-Latin-1) name, which can't go in a header verbatim. encodeURIComponent
 * leaves `'()*!` alone, but RFC 5987 doesn't allow them in an ext-value (`'`
 * is its delimiter), so those are escaped too.
 */
export function attachmentDisposition(
  filename: string,
  fallback: string,
): string {
  const name = sanitizeFilename(filename) || fallback;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
