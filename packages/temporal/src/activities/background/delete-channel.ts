import {
  Channel,
  ChannelMembership,
  ChannelSubscription,
  db,
  OrganizationChannelAssociation,
  UploadRecord,
  UploadState,
} from '@letschurch/db';
import { backupS3 } from '@letschurch/s3/backup';
import { publicS3 } from '@letschurch/s3/public';
import { Context } from '@temporalio/activity';
import { and, eq, inArray } from 'drizzle-orm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/delete-channel',
});

export async function markChannelDeleted(channelId: string): Promise<boolean> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'markChannelDeleted',
    context: { args: { channelId } },
  });
  activityLogger.info(`Marking channel ${channelId} as deleted`);

  try {
    await db
      .update(Channel)
      .set({
        deletedAt: new Date(),
        visibility: 'PRIVATE',
        updatedAt: new Date(),
      })
      .where(eq(Channel.id, channelId));
    activityLogger.info(`Channel ${channelId} marked as deleted`);
    return true;
  } catch (e) {
    activityLogger.error(`Error marking channel ${channelId} as deleted: ${e}`);
    return false;
  }
}

export async function getChannelUploadIds(
  channelId: string,
): Promise<string[]> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'getChannelUploadIds',
    context: { args: { channelId } },
  });
  activityLogger.info(`Getting upload IDs for channel ${channelId}`);

  try {
    const uploads = await db
      .select({ id: UploadRecord.id })
      .from(UploadRecord)
      .where(eq(UploadRecord.channelId, channelId));
    const uploadIds = uploads.map((upload) => upload.id);
    activityLogger.info(
      `Found ${uploadIds.length} uploads for channel ${channelId}`,
    );
    return uploadIds;
  } catch (e) {
    activityLogger.error(
      `Error getting upload IDs for channel ${channelId}: ${e}`,
    );
    return [];
  }
}

export async function deleteChannelFiles(channelId: string): Promise<number> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteChannelFiles',
    context: { args: { channelId } },
  });
  activityLogger.info(`Deleting files for channel ${channelId}`);

  let deletedCount = 0;

  try {
    // Get the channel to find file paths
    const channel = await db
      .select({
        avatarPath: Channel.avatarPath,
        defaultThumbnailPath: Channel.defaultThumbnailPath,
      })
      .from(Channel)
      .where(eq(Channel.id, channelId))
      .then((r) => r[0] ?? null);

    if (!channel) {
      activityLogger.warn(`Channel ${channelId} not found`);
      return 0;
    }

    // Delete avatar from S3
    if (channel.avatarPath) {
      Context.current().heartbeat('Deleting channel avatar');
      try {
        await publicS3.deleteFile(channel.avatarPath);
        activityLogger.info(`Deleted avatar: ${channel.avatarPath}`);
        deletedCount += 1;
      } catch (error) {
        activityLogger.error(
          `Failed to delete avatar ${channel.avatarPath}: ${error}`,
        );
      }
    }

    // Delete default thumbnail from S3
    if (channel.defaultThumbnailPath) {
      Context.current().heartbeat('Deleting channel default thumbnail');
      try {
        await publicS3.deleteFile(channel.defaultThumbnailPath);
        activityLogger.info(
          `Deleted default thumbnail: ${channel.defaultThumbnailPath}`,
        );
        deletedCount += 1;
      } catch (error) {
        activityLogger.error(
          `Failed to delete default thumbnail ${channel.defaultThumbnailPath}: ${error}`,
        );
      }
    }

    // Find and delete UploadState records for channel files
    Context.current().heartbeat('Deleting channel UploadState records');
    const uploadStates = await db
      .select()
      .from(UploadState)
      .where(
        and(
          eq(UploadState.channelId, channelId),
          inArray(UploadState.uploadType, [
            'CHANNEL_AVATAR',
            'CHANNEL_DEFAULT_THUMBNAIL',
          ]),
        ),
      );

    activityLogger.info(
      `Found ${uploadStates.length} UploadState records for channel files`,
    );

    // Delete backups and UploadState records
    for (const uploadState of uploadStates) {
      Context.current().heartbeat(
        `Deleting UploadState backup ${uploadState.id}`,
      );

      // Delete from backup if backed up
      if (uploadState.backupKey && uploadState.backupStatus === 'BACKED_UP') {
        try {
          await backupS3.deleteFile(uploadState.backupKey);
          activityLogger.info(`Deleted backup: ${uploadState.backupKey}`);
          deletedCount += 1;
        } catch (error) {
          activityLogger.error(
            `Failed to delete backup ${uploadState.backupKey}: ${error}`,
          );
        }
      }

      // Delete the UploadState record
      try {
        await db.delete(UploadState).where(eq(UploadState.id, uploadState.id));
        activityLogger.info(`Deleted UploadState record ${uploadState.id}`);
      } catch (error) {
        activityLogger.error(
          `Failed to delete UploadState record ${uploadState.id}: ${error}`,
        );
      }
    }

    activityLogger.info(
      `Deleted ${deletedCount} files for channel ${channelId}`,
    );
    return deletedCount;
  } catch (e) {
    activityLogger.error(`Error deleting files for channel ${channelId}: ${e}`);
    return deletedCount;
  }
}

export async function deleteChannelAssociations(
  channelId: string,
): Promise<boolean> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteChannelAssociations',
    context: { args: { channelId } },
  });
  activityLogger.info(`Deleting associations for channel ${channelId}`);

  try {
    // Delete memberships (cascade delete is configured in schema)
    const memberships = await db
      .delete(ChannelMembership)
      .where(eq(ChannelMembership.channelId, channelId))
      .returning();
    activityLogger.info(`Deleted ${memberships.length} channel memberships`);

    // Delete subscriptions (cascade delete is configured in schema)
    const subscriptions = await db
      .delete(ChannelSubscription)
      .where(eq(ChannelSubscription.channelId, channelId))
      .returning();
    activityLogger.info(
      `Deleted ${subscriptions.length} channel subscriptions`,
    );

    // Delete organization associations (cascade delete is configured in schema)
    const orgAssocs = await db
      .delete(OrganizationChannelAssociation)
      .where(eq(OrganizationChannelAssociation.channelId, channelId))
      .returning();
    activityLogger.info(
      `Deleted ${orgAssocs.length} organization channel associations`,
    );

    // Note: UploadList records have nullable channelId, so they become orphaned
    // This is intentional - playlists can exist without a channel

    activityLogger.info(`Deleted associations for channel ${channelId}`);
    return true;
  } catch (e) {
    activityLogger.error(
      `Error deleting associations for channel ${channelId}: ${e}`,
    );
    return false;
  }
}

export async function deleteChannelDb(channelId: string): Promise<boolean> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteChannelDb',
    context: { args: { channelId } },
  });
  activityLogger.info(`Deleting channel ${channelId} from database`);

  try {
    await db.delete(Channel).where(eq(Channel.id, channelId));
    activityLogger.info(`Channel ${channelId} deleted from database`);
    return true;
  } catch (e) {
    activityLogger.error(
      `Error deleting channel ${channelId} from database: ${e}`,
    );
    return false;
  }
}
