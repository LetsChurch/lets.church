/**
 * Pure helpers for building Let's Church dashboard / admin deep-links and the
 * Temporal "User Metadata" markdown (`staticSummary` / `staticDetails`) that
 * renders in the Temporal UI's User Metadata tab.
 *
 * Intentionally dependency-free: no DB, no `@temporalio/*`, and no env access
 * beyond an explicitly-passed (or default `WEB_URL`) base. That keeps it safe
 * to import from
 *   - the web SSR bundle (`packages/web/src/temporal/index.ts`),
 *   - the Temporal client (`packages/temporal/src/client`),
 *   - PagerDuty alert activities, and
 *   - workflow-sandbox code (the path/markdown bits — do NOT call
 *     `absoluteWebUrl` from inside a workflow, it reads `process.env`).
 *
 * This is the single source of truth for dashboard URL shapes; PagerDuty
 * alert links and workflow user-metadata links both build on it so the two
 * can't drift.
 *
 * Note: the markdown produced here (`mdLink`, `staticMeta` summaries/details)
 * is NOT HTML-escaped. It is only ever rendered in operator-facing surfaces
 * (the Temporal UI's User Metadata tab and PagerDuty incidents), never to end
 * users, so we rely on those tools' own renderers rather than escaping here.
 */

export type LcLink = { href: string; text: string };

export function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

/** Dashboard / admin route paths (relative to the web origin). */
export const dashboardPaths = {
  upload: (channelId: string, uploadId: string) =>
    `/dashboard/channels/${channelId}/uploads/${uploadId}`,
  channel: (channelId: string) => `/dashboard/channels/${channelId}`,
  adminImportSources: () => '/dashboard/admin/import-sources',
} as const;

/**
 * Resolve a relative dashboard path against the web origin. Returns `null`
 * when no base URL is available (so callers can drop the link rather than
 * emit a broken relative href). Absolute (`http(s)://`) hrefs pass through
 * unchanged.
 */
export function absoluteWebUrl(
  path: string,
  webUrl: string | undefined = process.env.WEB_URL,
): string | null {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!webUrl) {
    return null;
  }
  return `${trimTrailingSlash(webUrl)}${path}`;
}

/** Render a link as Temporal/CommonMark markdown: `[text](href)`. */
export function mdLink({ href, text }: LcLink): string {
  return `[${text}](${href})`;
}

/**
 * Build the `{ staticSummary, staticDetails }` pair for a workflow's User
 * Metadata tab. `summary` is a single line; `links` and `detailLines` become
 * the multi-line markdown `staticDetails`. Empty `staticDetails` is omitted so
 * we never set a blank field.
 */
export function staticMeta({
  summary,
  links = [],
  detailLines = [],
}: {
  summary: string;
  links?: LcLink[];
  detailLines?: string[];
}): { staticSummary: string; staticDetails?: string } {
  const blocks: string[] = [];
  if (links.length) {
    blocks.push(links.map((link) => `- ${mdLink(link)}`).join('\n'));
  }
  if (detailLines.length) {
    blocks.push(detailLines.join('\n'));
  }
  const staticDetails = blocks.join('\n\n');
  return {
    staticSummary: summary,
    ...(staticDetails ? { staticDetails } : {}),
  };
}

/**
 * Convenience: the standard links for an upload-scoped workflow — the upload's
 * dashboard page and its channel page — resolved to absolute URLs. Drops any
 * link whose base URL can't be resolved. `channelId` may be null/undefined
 * (e.g. an upload not yet attached to a channel), in which case only links it
 * can build are returned.
 */
export function uploadDashboardLinks(
  channelId: string | null | undefined,
  uploadId: string,
  webUrl: string | undefined = process.env.WEB_URL,
): LcLink[] {
  const out: LcLink[] = [];
  if (channelId) {
    const uploadHref = absoluteWebUrl(
      dashboardPaths.upload(channelId, uploadId),
      webUrl,
    );
    if (uploadHref) {
      out.push({ href: uploadHref, text: "Let's Church dashboard" });
    }
    const channelHref = absoluteWebUrl(
      dashboardPaths.channel(channelId),
      webUrl,
    );
    if (channelHref) {
      out.push({ href: channelHref, text: 'Channel dashboard' });
    }
  }
  return out;
}
