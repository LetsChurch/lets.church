// Derive a URL-safe slug from a display name ("First Baptist!" → "first-baptist").
// Lowercased, Unicode-normalized, non-alphanumerics collapsed to single hyphens,
// with no leading or trailing hyphens. Matches the `^[a-zA-Z0-9_-]+$` slug
// constraint shared by channels and churches.
//
// Returns '' when the name contains no slug-able characters; the create
// procedures treat a blank slug as "auto-generate", so callers can pass the
// result straight through.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
