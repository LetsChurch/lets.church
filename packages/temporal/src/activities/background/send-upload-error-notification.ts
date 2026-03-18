import { prisma } from '@letschurch/db';
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
  const record = await prisma.uploadRecord.findUnique({
    where: { id: uploadRecordId },
    include: {
      channel: {
        include: {
          memberships: {
            where: { isAdmin: true },
            include: {
              appUser: {
                include: {
                  emails: {
                    where: { verifiedAt: { not: null } },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!record) {
    moduleLogger.warn(
      'Upload record not found, cannot send error notification',
    );
    return;
  }

  const title = record.title ?? record.originalFileName ?? uploadRecordId;

  // Send to channel admins
  const adminEmails = record.channel.memberships
    .map((m) => m.appUser.emails[0]?.email)
    .filter(Boolean);

  if (adminEmails.length > 0) {
    try {
      await sendEmail({
        from: 'hello@lets.church',
        to: adminEmails,
        subject: `Upload Failed to Process: ${title}`,
        text: `An upload for your channel "${record.channel.name}" failed to process.\n\nTitle: ${title}\nUpload ID: ${uploadRecordId}\n\nError: ${error}\n\nPlease contact support if this problem persists.`,
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
        text: `An upload has failed to process.\n\nTitle: ${title}\nChannel: ${record.channel.name}\nChannel ID: ${record.channelId}\nUpload ID: ${uploadRecordId}\n\nError: ${error}`,
      });

      moduleLogger.info('Sent error notification to site admin');
    } catch (_emailError) {
      moduleLogger.error('Failed to send error notification to site admin');
    }
  }
}
