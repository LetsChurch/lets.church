import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'activities/background/trigger-pagerduty-alert',
});

const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue';

export type PagerDutySeverity = 'critical' | 'error' | 'warning' | 'info';

export type TriggerPagerDutyAlertArgs = {
  // Stable key so repeated failures of the same thing coalesce into a
  // single PagerDuty incident instead of opening a new one each time.
  dedupKey: string;
  summary: string;
  severity?: PagerDutySeverity;
  // Logical component, e.g. 'process-media' / 'import-media'.
  component?: string;
  customDetails?: Record<string, unknown>;
};

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
}: TriggerPagerDutyAlertArgs): Promise<void> {
  const routingKey = process.env.PAGERDUTY_ROUTING_KEY;
  if (!routingKey) {
    moduleLogger.warn(
      { context: { dedupKey, component } },
      'PAGERDUTY_ROUTING_KEY not set; skipping PagerDuty alert',
    );
    return;
  }

  const res = await fetch(PAGERDUTY_EVENTS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      routing_key: routingKey,
      event_action: 'trigger',
      dedup_key: dedupKey,
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
