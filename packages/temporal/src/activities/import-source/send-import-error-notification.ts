import {
  AppUserEmail,
  Channel,
  ChannelImportSource,
  ChannelMembership,
  db,
} from '@letschurch/db';
import { and, eq, isNotNull } from 'drizzle-orm';

import logger from '../../util/logger';
import sendEmail from '../background/send-email';

const moduleLogger = logger.child({
  module: 'send-import-error-notification',
});

/**
 * Send error notifications to channel admins and site admin.
 */
export async function sendImportErrorNotification(
  importSourceId: string,
  error: string,
) {
  const source = await db
    .select({
      id: ChannelImportSource.id,
      url: ChannelImportSource.url,
      channelId: ChannelImportSource.channelId,
    })
    .from(ChannelImportSource)
    .where(eq(ChannelImportSource.id, importSourceId))
    .then((r) => r[0] ?? null);

  if (!source) {
    moduleLogger.warn(
      'Import source not found, cannot send error notification',
    );
    return;
  }

  const channel = await db
    .select({ name: Channel.name })
    .from(Channel)
    .where(eq(Channel.id, source.channelId))
    .then((r) => r[0] ?? null);

  if (!channel) {
    moduleLogger.warn('Channel not found, cannot send error notification');
    return;
  }

  // Get admin memberships
  const adminMemberships = await db
    .select({ appUserId: ChannelMembership.appUserId })
    .from(ChannelMembership)
    .where(
      and(
        eq(ChannelMembership.channelId, source.channelId),
        eq(ChannelMembership.isAdmin, true),
      ),
    );

  // Collect admin emails
  const adminEmails: string[] = [];
  for (const membership of adminMemberships) {
    const emailRow = await db
      .select({ email: AppUserEmail.email })
      .from(AppUserEmail)
      .where(
        and(
          eq(AppUserEmail.appUserId, membership.appUserId),
          isNotNull(AppUserEmail.verifiedAt),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    if (emailRow) {
      adminEmails.push(emailRow.email);
    }
  }

  // Send to channel admins
  if (adminEmails.length > 0) {
    try {
      await sendEmail({
        to: adminEmails,
        subject: `Import Failed: ${channel.name}`,
        text: `An import source for your channel "${channel.name}" has failed.\n\nSource URL: ${source.url}\n\nError: ${error}\n\nPlease check your channel's import sources in the admin dashboard.`,
      });

      moduleLogger.info('Sent error notification to channel admins');
    } catch (_emailError) {
      moduleLogger.error('Failed to send error notification to channel admins');
    }
  }

  // Send to site admin
  const { ADMIN_EMAIL } = process.env;
  if (ADMIN_EMAIL) {
    try {
      await sendEmail({
        to: [ADMIN_EMAIL],
        subject: `Import Source Error: ${channel.name}`,
        text: `An import source has failed for channel "${channel.name}".\n\nSource URL: ${source.url}\nChannel ID: ${source.channelId}\nImport Source ID: ${importSourceId}\n\nError: ${error}`,
      });

      moduleLogger.info('Sent error notification to site admin');
    } catch (_emailError) {
      moduleLogger.error('Failed to send error notification to site admin');
    }
  }

  // Update import source with error info
  await db
    .update(ChannelImportSource)
    .set({
      lastErrorAt: new Date(),
      lastErrorMessage: error,
      updatedAt: new Date(),
    })
    .where(eq(ChannelImportSource.id, importSourceId));
}
