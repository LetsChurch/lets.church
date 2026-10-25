import { db, OrganizationChannelLinkSuggestion } from '@letschurch/db';

import { absoluteWebUrl, dashboardPaths } from '../../util/dashboard-links';
import logger from '../../util/logger';
import {
  describeSignal,
  findOrganizationChannelLinkSuggestions,
} from '../../util/org-channel-link-suggestions';
import sendEmail from './send-email';

const moduleLogger = logger.child({
  module: 'org-channel-link-suggestions',
});

/**
 * Weekly digest: email the site admin the suggestions not reported before,
 * then mark them notified so the next run only reports newer ones. Dismissed
 * pairs never reappear; reported-but-unhandled pairs stay on the dashboard.
 */
export async function sendOrganizationChannelLinkDigest(): Promise<{
  total: number;
  notified: number;
}> {
  const suggestions = await findOrganizationChannelLinkSuggestions();
  const fresh = suggestions.filter((s) => s.notifiedAt === null);

  if (fresh.length === 0) {
    moduleLogger.info('No new organization/channel link suggestions');
    return { total: suggestions.length, notified: 0 };
  }

  const { ADMIN_EMAIL } = process.env;
  if (!ADMIN_EMAIL) {
    moduleLogger.warn(
      'ADMIN_EMAIL is not set, skipping link suggestion digest',
    );
    return { total: suggestions.length, notified: 0 };
  }

  const dashboardUrl = absoluteWebUrl(dashboardPaths.adminLinkSuggestions());
  const lines = fresh.map(
    (s) =>
      `- [${s.confidence}] ${s.organization.name} (${s.organization.slug}) <-> ${s.channel.name} (${s.channel.slug}, ${s.channel.uploadCount} uploads): ${s.signals.map(describeSignal).join(', ')}`,
  );
  const plural = fresh.length === 1 ? '' : 's';

  await sendEmail({
    from: 'hello@lets.church',
    to: [ADMIN_EMAIL],
    subject: `${fresh.length} new organization/channel link suggestion${plural}`,
    text: [
      `Found ${fresh.length} new organization/channel pair${plural} that look like they should be linked (${suggestions.length} open in total).`,
      '',
      ...lines,
      '',
      dashboardUrl
        ? `Review, link, or dismiss them at ${dashboardUrl}`
        : 'Review, link, or dismiss them in the admin dashboard.',
    ].join('\n'),
  });

  const now = new Date();
  await db
    .insert(OrganizationChannelLinkSuggestion)
    .values(
      fresh.map((s) => ({
        organizationId: s.organization.id,
        channelId: s.channel.id,
        notifiedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        OrganizationChannelLinkSuggestion.organizationId,
        OrganizationChannelLinkSuggestion.channelId,
      ],
      set: { notifiedAt: now },
    });

  moduleLogger.info(
    { context: { notified: fresh.length, total: suggestions.length } },
    'Sent organization/channel link suggestion digest',
  );

  return { total: suggestions.length, notified: fresh.length };
}
