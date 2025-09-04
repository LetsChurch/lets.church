import { UploadLicense } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { invariant } from 'es-toolkit';
import {
  finalizeMultipartUploadSchema,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  addMemberSchema,
  channelQuerySchema,
  channelUploadsQuerySchema,
  createUploadSchema,
  deleteUploadSchema,
  removeMemberSchema,
  updateChannelSchema,
  updateUploadSchema,
  uploadQuerySchema,
  userSearchSchema,
} from '@/schemas/dashboard';
import {
  completeMultipartMediaUpload,
  deleteUpload,
  handleMultipartMediaUpload,
} from '@/temporal';
import db from '@/util/db';
import logger from '@/util/logger';
import {
  createMultipartUpload,
  createPresignedPartUploadUrls,
  PART_SIZE,
} from '@/util/s3';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/channel',
});

const channelProcedure = authProcedure
  .input(channelQuerySchema)
  .use(async ({ ctx, input, next }) => {
    const membership = await db.channelMembership.findFirst({
      where: { appUserId: ctx.session.appUserId, channelId: input.channelId },
    });

    if (!membership) {
      moduleLogger.warn('No membership found for channel procedure', {
        ...input,
      });

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({ ctx: { ...ctx, membership } });
  });

const channelAdminProcedure = channelProcedure.use(async ({ ctx, next }) => {
  if (!ctx.membership.isAdmin) {
    moduleLogger.warn('User is not admin of channel', {
      appUserId: ctx.session.appUserId,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

const channelUploadProcedure = channelProcedure.use(async ({ ctx, next }) => {
  if (!ctx.membership.isAdmin && !ctx.membership.canUpload) {
    moduleLogger.warn('User cannot upload to channel', {
      appUserId: ctx.session.appUserId,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

const channelEditProcedure = channelProcedure.use(async ({ ctx, next }) => {
  if (!ctx.membership.isAdmin && !ctx.membership.canEdit) {
    moduleLogger.warn('User cannot edit content in channel', {
      appUserId: ctx.session.appUserId,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const channelRouter = router({
  getChannels: authProcedure.query(({ ctx }) => {
    return db.channel.findMany({
      select: {
        id: true,
        name: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
            canUpload: true,
          },
          where: {
            appUserId: ctx.session.appUser.id,
          },
        },
      },
      where: {
        memberships: {
          some: {
            appUserId: ctx.session.appUser.id,
          },
        },
      },
    });
  }),

  getChannelDetails: channelProcedure.query(async ({ ctx, input }) => {
    const channel = await db.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        visibility: true,
        avatarPath: true,
        avatarBlurhash: true,
        defaultThumbnailPath: true,
        defaultThumbnailBlurhash: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
            canUpload: true,
            appUser: {
              select: {
                id: true,
                username: true,
                fullName: true,
                emails: {
                  select: {
                    email: true,
                    verifiedAt: true,
                  },
                },
              },
            },
          },
        },
        subscribers: {
          select: {
            appUserId: true,
          },
        },
        uploadRecords: {
          select: {
            id: true,
            title: true,
            createdAt: true,
          },
          where: {
            channel: {
              memberships: {
                some: {
                  appUserId: ctx.session.appUser.id,
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            uploadRecords: true,
            subscribers: true,
            memberships: true,
          },
        },
      },
      where: {
        id: input.channelId,
        memberships: {
          some: {
            appUserId: ctx.session.appUser.id,
          },
        },
      },
    });

    if (!channel) {
      moduleLogger.warn('No channel found for user', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const totalViews = await db.uploadView.count({
      where: {
        upload: {
          channelId: input.channelId,
        },
      },
    });

    return { ...channel, userMembership: ctx.membership, totalViews };
  }),

  getChannelForEdit: channelAdminProcedure.query(async ({ ctx, input }) => {
    const channel = await db.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        visibility: true,
      },
      where: {
        id: input.channelId,
        memberships: {
          some: {
            appUserId: ctx.session.appUser.id,
            isAdmin: true,
          },
        },
      },
    });

    if (!channel) {
      moduleLogger.warn('Channel not found for editing', {
        ...input,
      });

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return channel;
  }),

  updateChannel: channelAdminProcedure
    .input(updateChannelSchema)
    .mutation(async ({ ctx, input }) => {
      const updatedChannel = await db.channel.update({
        where: {
          id: input.channelId,
          memberships: {
            some: {
              appUserId: ctx.session.appUser.id,
              isAdmin: true,
            },
          },
        },
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          visibility: input.visibility,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          visibility: true,
        },
      });

      return { success: true, channel: updatedChannel };
    }),

  getChannelMembers: channelProcedure.query(async ({ ctx, input }) => {
    const channel = await db.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        memberships: {
          select: {
            channelId: true,
            appUserId: true,
            isAdmin: true,
            canEdit: true,
            canUpload: true,
            createdAt: true,
            appUser: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarPath: true,
              },
            },
          },
          orderBy: [{ isAdmin: 'desc' }, { createdAt: 'asc' }],
        },
      },
      where: {
        id: input.channelId,
      },
    });

    if (!channel) {
      moduleLogger.warn('Channel not found for members', {
        ...input,
      });

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return { ...channel, userMembership: ctx.membership };
  }),

  searchUsers: channelAdminProcedure
    .input(userSearchSchema)
    .query(async ({ input }) => {
      const users = await db.appUser.findMany({
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarPath: true,
        },
        where: {
          username: {
            contains: input.query,
            mode: 'insensitive',
          },
          NOT: {
            channelMemberships: {
              some: {
                channelId: input.channelId,
              },
            },
          },
        },
        take: 10,
      });

      return users;
    }),

  addChannelMember: channelAdminProcedure
    .input(addMemberSchema)
    .mutation(async ({ input }) => {
      await db.channelMembership.create({
        data: {
          channelId: input.channelId,
          appUserId: input.userId,
          isAdmin: input.isAdmin,
          canEdit: input.canEdit,
          canUpload: input.canUpload,
        },
      });

      return { success: true };
    }),

  removeChannelMember: channelAdminProcedure
    .input(removeMemberSchema)
    .mutation(async ({ ctx, input }) => {
      // Don't allow removing the last admin
      const adminCount = await db.channelMembership.count({
        where: {
          channelId: input.channelId,
          isAdmin: true,
        },
      });

      const membershipToDelete = await db.channelMembership.findUnique({
        where: {
          channelId_appUserId: {
            channelId: input.channelId,
            appUserId: input.appUserId,
          },
        },
        select: { isAdmin: true, appUserId: true },
      });

      if (membershipToDelete?.isAdmin && adminCount <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the last admin from the channel',
        });
      }

      // Don't allow removing yourself
      if (membershipToDelete?.appUserId === ctx.session.appUser.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot remove yourself from the channel',
        });
      }

      await db.channelMembership.delete({
        where: {
          channelId_appUserId: {
            channelId: input.channelId,
            appUserId: input.appUserId,
          },
        },
      });

      return { success: true };
    }),

  getChannelUploads: channelProcedure
    .input(channelUploadsQuerySchema)
    .query(async ({ ctx, input }) => {
      const channel = await db.channel.findFirst({
        select: {
          id: true,
          name: true,
          slug: true,
          memberships: {
            select: {
              isAdmin: true,
              canEdit: true,
              canUpload: true,
              appUser: {
                select: {
                  id: true,
                  role: true,
                },
              },
            },
          },
        },
        where: {
          id: input.channelId,
        },
      });

      if (!channel) {
        moduleLogger.warn('Channel not found for uploads', {
          ...input,
        });

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const offset = (input.page - 1) * input.limit;

      const [uploads, totalCount] = await Promise.all([
        db.uploadRecord.findMany({
          select: {
            id: true,
            title: true,
            description: true,
            visibility: true,
            createdAt: true,
            lengthSeconds: true,
            _count: {
              select: {
                uploadViews: true,
                userComments: true,
              },
            },
          },
          where: {
            channelId: input.channelId,
            OR: [
              { visibility: 'PUBLIC' },
              { visibility: 'UNLISTED' },
              {
                AND: [
                  { visibility: 'PRIVATE' },
                  {
                    channel: {
                      memberships: {
                        some: {
                          appUserId: ctx.session.appUser.id,
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: input.limit,
        }),
        db.uploadRecord.count({
          where: {
            channelId: input.channelId,
            OR: [
              { visibility: 'PUBLIC' },
              { visibility: 'UNLISTED' },
              {
                AND: [
                  { visibility: 'PRIVATE' },
                  {
                    channel: {
                      memberships: {
                        some: {
                          appUserId: ctx.session.appUser.id,
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        }),
      ]);

      const totalPages = Math.ceil(totalCount / input.limit);

      return {
        channel: {
          ...channel,
          userMembership: ctx.membership,
        },
        uploads,
        pagination: {
          page: input.page,
          limit: input.limit,
          totalCount,
          totalPages,
        },
      };
    }),

  createUploadRecord: channelUploadProcedure
    .input(createUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const { id } = await db.uploadRecord.create({
        data: {
          license: UploadLicense.STANDARD,
          visibility: 'PRIVATE',
          channel: {
            connect: {
              id: input.channelId,
            },
          },
          createdBy: {
            connect: {
              id: ctx.session.appUser.id,
            },
          },
        },
      });

      return id;
    }),

  deleteUploadRecord: channelAdminProcedure
    .input(deleteUploadSchema)
    .mutation(async ({ input }) => {
      // Verify the upload belongs to this channel
      const upload = await db.uploadRecord.findFirst({
        select: {
          id: true,
          channelId: true,
        },
        where: {
          id: input.uploadId,
          channelId: input.channelId,
        },
      });

      if (!upload) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found',
        });
      }

      // Start the delete workflow
      await deleteUpload(input.uploadId);

      return { success: true, uploadId: input.uploadId };
    }),

  getUploadRecord: channelEditProcedure
    .input(uploadQuerySchema)
    .query(async ({ ctx, input }) => {
      const upload = await db.uploadRecord.findFirst({
        select: {
          id: true,
          title: true,
          description: true,
          license: true,
          visibility: true,
          publishedAt: true,
          userCommentsEnabled: true,
          downloadsEnabled: true,
          defaultThumbnailPath: true,
          overrideThumbnailPath: true,
          transcodingFinishedAt: true,
          transcribingFinishedAt: true,
          transcodingProgress: true,
          channel: {
            select: {
              id: true,
              name: true,
              memberships: {
                select: {
                  isAdmin: true,
                  canEdit: true,
                  appUser: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
        where: {
          id: input.uploadId,
          channelId: input.channelId,
        },
      });

      if (!upload) {
        moduleLogger.warn('Upload not found', {
          ...input,
        });

        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found or access denied',
        });
      }

      const userMembership = upload.channel.memberships.find(
        (m) => m.appUser.id === ctx.session.appUser.id,
      );

      return {
        upload,
        channel: {
          ...upload.channel,
          userMembership,
        },
      };
    }),

  updateUploadRecord: channelEditProcedure
    .input(updateUploadSchema)
    .mutation(async ({ input }) => {
      const upload = await db.uploadRecord.findFirst({
        select: {
          id: true,
          channel: {
            select: {
              memberships: {
                select: {
                  isAdmin: true,
                  canEdit: true,
                  appUser: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
        where: {
          id: input.uploadId,
          channelId: input.channelId,
        },
      });

      if (!upload) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found or access denied',
        });
      }

      const updatedUpload = await db.uploadRecord.update({
        where: { id: input.uploadId },
        data: {
          title: input.title,
          description: input.description,
          license: input.license,
          publishedAt: input.publishedAt,
          visibility: input.visibility,
          userCommentsEnabled: input.userCommentsEnabled,
          downloadsEnabled: input.downloadsEnabled,
        },
        select: {
          id: true,
          title: true,
          description: true,
          license: true,
          visibility: true,
          publishedAt: true,
          userCommentsEnabled: true,
          downloadsEnabled: true,
        },
      });

      return { success: true, upload: updatedUpload };
    }),

  createMultipartUpload: channelUploadProcedure
    .input(multipartUploadSchema)
    .mutation(
      async ({ input: { targetId, uploadMimeType, postProcess, bytes } }) => {
        const { uploadKey, uploadId } = await createMultipartUpload(
          'INGEST',
          targetId,
          uploadMimeType,
        );

        await handleMultipartMediaUpload(
          targetId,
          'INGEST',
          uploadId,
          uploadKey,
          postProcess,
        );

        const urls = await createPresignedPartUploadUrls(
          'INGEST',
          uploadId,
          uploadKey,
          bytes,
        );

        return {
          s3UploadKey: uploadKey,
          s3UploadId: uploadId,
          partSize: PART_SIZE,
          urls,
        };
      },
    ),

  finalizeMultipartUpload: channelUploadProcedure
    .input(finalizeMultipartUploadSchema)
    .mutation(
      async ({ ctx, input: { s3UploadId, s3UploadKey, s3PartETags } }) => {
        const userId = ctx.session?.appUserId;
        invariant(userId, 'No user found');
        await completeMultipartMediaUpload(
          s3UploadId,
          s3UploadKey,
          s3PartETags,
          userId,
        );

        return true;
      },
    ),
});
