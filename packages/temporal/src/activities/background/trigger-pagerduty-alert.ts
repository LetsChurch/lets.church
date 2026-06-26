import { db, UploadRecord } from '@letschurch/db';
import { Context } from '@temporalio/activity';
import { eq } from 'drizzle-orm';
import {
  absoluteWebUrl,
  dashboardPaths,
  trimTrailingSlash,
} from '../../util/dashboard-links';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'activities/background/trigger-pagerduty-alert',
});

const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';

export type PagerDutySeverity = 'critical' | 'error' | 'warning' | 'info';

// PagerDuty Events API v2 "links" entry (top-level, alongside `payload`).
export type PagerDutyLink = { href: string; text: string };

export type TriggerPagerDutyAlertArgs = {
  // Stable key so repeated failures of the same thing coalesce into a
  // single PagerDuty incident instead of opening a new one each time.
  dedupKey: string;
  summary: string;
  severity?: PagerDutySeverity;
  // Logical component, e.g. 'process-media' / 'import-media'.
  component?: string;
  customDetails?: Record<string, unknown>;
  // Deep-link the alert to the upload's dashboard page. The channel id is
  // resolved from the upload record (the dashboard route is keyed by
  // channel + upload).
  uploadId?: string;
  // Extra links to attach. An `href` that starts with `/` is treated as a
  // dashboard path and resolved against WEB_URL; anything else (e.g. a
  // source media URL) is passed through as-is.
  links?: PagerDutyLink[];
};

/**
 * Assemble the responder-facing links for an alert: the failing Temporal
 * workflow execution (from the calling workflow's activity context) plus any
 * caller-supplied upload/dashboard links. Best-effort — a missing env var or
 * a DB hiccup drops the relevant link rather than failing the alert.
 */
async function buildLinks({
  uploadId,
  links,
}: Pick<TriggerPagerDutyAlertArgs, 'uploadId' | 'links'>): Promise<
  PagerDutyLink[]
> {
  const out: PagerDutyLink[] = [];

  // Temporal UI deep-link to the workflow execution that fired this alert.
  const temporalUiUrl = process.env.TEMPORAL_UI_PUBLIC_URL;
  if (temporalUiUrl) {
    try {
      const { workflowExecution, workflowNamespace } = Context.current().info;
      if (workflowExecution) {
        const { workflowId, runId } = workflowExecution;
        out.push({
          href: `${trimTrailingSlash(temporalUiUrl)}/namespaces/${encodeURIComponent(
            workflowNamespace ?? 'default',
          )}/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(
            runId,
          )}/timeline`,
          text: 'Temporal workflow',
        });
      }
    } catch (err) {
      moduleLogger.warn(
        { err: err instanceof Error ? err : new Error(String(err)) },
        'Could not resolve Temporal workflow context for alert link',
      );
    }
  }

  // Upload dashboard page (channel id resolved from the upload record).
  if (uploadId) {
    try {
      const channelId = await db
        .select({ channelId: UploadRecord.channelId })
        .from(UploadRecord)
        .where(eq(UploadRecord.id, uploadId))
        .then((r) => r[0]?.channelId ?? null);
      const href = channelId
        ? absoluteWebUrl(dashboardPaths.upload(channelId, uploadId))
        : null;
      if (href) {
        out.push({ href, text: "Let's Church dashboard" });
      }
    } catch (err) {
      moduleLogger.warn(
        { uploadId, err: err instanceof Error ? err : new Error(String(err)) },
        'Could not resolve channel for upload dashboard link',
      );
    }
  }

  for (const link of links ?? []) {
    // Relative dashboard paths need WEB_URL to become absolute; drop them
    // (rather than emit a broken link) when it is unset. Absolute hrefs
    // (e.g. a source media URL) pass through unchanged.
    const href = absoluteWebUrl(link.href);
    if (href) {
      out.push({ href, text: link.text });
    }
  }

  return out;
}

/**
 * Fire a PagerDuty Events API v2 "trigger" event. Soft dependency: if
 * `PAGERDUTY_ROUTING_KEY` is unset (dev / non-prod) this is a no-op, so
 * callers can wire it into failure paths unconditionally. Throws on a
 * non-2xx response so Temporal retries transient PagerDuty outages;
 * callers treat it as best-effort and shouldn't let it mask the original
 * failure.
 */
export async function triggerPagerDutyAlert({
  dedupKey,
  summary,
  severity = 'error',
  component,
  customDetails,
  uploadId,
  links,
}: TriggerPagerDutyAlertArgs): Promise<void> {
  const routingKey = process.env.PAGERDUTY_ROUTING_KEY;
  if (!routingKey) {
    moduleLogger.warn(
      { context: { dedupKey, component } },
      'PAGERDUTY_ROUTING_KEY not set; skipping PagerDuty alert',
    );
    return;
  }

  const resolvedLinks = await buildLinks({ uploadId, links });

  const res = await fetch(PAGERDUTY_EVENTS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      routing_key: routingKey,
      event_action: 'trigger',
      dedup_key: dedupKey,
      // `links` is a top-level Events API v2 field, not part of `payload`.
      ...(resolvedLinks.length ? { links: resolvedLinks } : {}),
      payload: {
        // PagerDuty caps the summary at 1024 chars.
        summary: summary.slice(0, 1024),
        severity,
        source: 'lets.church media pipeline',
        group: 'media-pipeline',
        ...(component ? { component } : {}),
        ...(customDetails ? { custom_details: customDetails } : {}),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `PagerDuty Events API returned ${res.status}: ${body.slice(0, 500)}`,
    );
  }

  moduleLogger.info(
    { context: { dedupKey, severity, component } },
    'PagerDuty alert triggered',
  );
}
