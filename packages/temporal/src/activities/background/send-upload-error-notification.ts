import {
  AppUserEmail,
  Channel,
  ChannelMembership,
  db,
  UploadRecord,
} from '@letschurch/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import logger from '../../util/logger';
import sendEmail from './send-email';

const moduleLogger = logger.child({
  module: 'send-upload-error-notification',
});

/**
 * Send error notifications to channel admins and site admin when an upload
 * fails to process.
 */
export async function sendUploadErrorNotification(
  uploadRecordId: string,
  error: string,
) {
  const record = await db
    .select({
      id: UploadRecord.id,
      title: UploadRecord.title,
      originalFileName: UploadRecord.originalFileName,
      channelId: UploadRecord.channelId,
    })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0] ?? null);

  if (!record) {
    moduleLogger.warn(
      'Upload record not found, cannot send error notification',
    );
    return;
  }

  const channel = await db
    .select({ name: Channel.name })
    .from(Channel)
    .where(eq(Channel.id, record.channelId))
    .then((r) => r[0]);

  if (!channel) {
    moduleLogger.warn('Channel not found, cannot send error notification');
    return;
  }

  // Get admin memberships with their emails
  const adminMemberships = await db
    .select({
      appUserId: ChannelMembership.appUserId,
    })
    .from(ChannelMembership)
    .where(
      and(
        eq(ChannelMembership.channelId, record.channelId),
        eq(ChannelMembership.isAdmin, true),
      ),
    );

  const title = record.title ?? record.originalFileName ?? uploadRecordId;

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
        from: 'hello@lets.church',
        to: adminEmails,
        subject: `Upload Failed to Process: ${title}`,
        text: `An upload for your channel "${channel.name}" failed to process.\n\nTitle: ${title}\nUpload ID: ${uploadRecordId}\n\nError: ${error}\n\nPlease contact support if this problem persists.`,
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
        from: 'hello@lets.church',
        to: [ADMIN_EMAIL],
        subject: `Upload Processing Failed: ${title}`,
        text: `An upload has failed to process.\n\nTitle: ${title}\nChannel: ${channel.name}\nChannel ID: ${record.channelId}\nUpload ID: ${uploadRecordId}\n\nError: ${error}`,
      });

      moduleLogger.info('Sent error notification to site admin');
    } catch (_emailError) {
      moduleLogger.error('Failed to send error notification to site admin');
    }
  }
}
