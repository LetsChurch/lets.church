import { prisma } from '@letschurch/db';
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
  const source = await prisma.channelImportSource.findUnique({
    where: { id: importSourceId },
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

  if (!source) {
    moduleLogger.warn(
      'Import source not found, cannot send error notification',
    );
    return;
  }

  // Send to channel admins
  const adminEmails = source.channel.memberships
    .map((m) => m.appUser.emails[0]?.email)
    .filter(Boolean);

  if (adminEmails.length > 0) {
    try {
      await sendEmail({
        to: adminEmails,
        subject: `Import Failed: ${source.channel.name}`,
        text: `An import source for your channel "${source.channel.name}" has failed.\n\nSource URL: ${source.url}\n\nError: ${error}\n\nPlease check your channel's import sources in the admin dashboard.`,
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
        subject: `Import Source Error: ${source.channel.name}`,
        text: `An import source has failed for channel "${source.channel.name}".\n\nSource URL: ${source.url}\nChannel ID: ${source.channelId}\nImport Source ID: ${importSourceId}\n\nError: ${error}`,
      });

      moduleLogger.info('Sent error notification to site admin');
    } catch (_emailError) {
      moduleLogger.error('Failed to send error notification to site admin');
    }
  }

  // Update import source with error info
  await prisma.channelImportSource.update({
    where: { id: importSourceId },
    data: {
      lastErrorAt: new Date(),
      lastErrorMessage: error,
    },
  });
}
