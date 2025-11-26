import { prisma, UploadLicense } from '@letschurch/db';
import { BACKGROUND_QUEUE } from '@letschurch/temporal/queues';
import { emailHtml } from '@letschurch/temporal/util/email';
import { sendEmailWorkflow } from '@letschurch/temporal/workflows/background/send-email';
import { TRPCError } from '@trpc/server';
import { invariant } from 'es-toolkit';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';
import {
  finalizeMultipartUploadSchema,
  getAvatarResize,
  getThumbnailResize,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  addMemberSchema,
  addToPlaylistSchema,
  bulkSetVisibilitySchema,
  channelQuerySchema,
  channelUploadsQuerySchema,
  createChannelSchema,
  createPlaylistSchema,
  createUploadSchema,
  deletePlaylistSchema,
  deleteUploadSchema,
  importMediaSchema,
  playlistQuerySchema,
  removeFromPlaylistSchema,
  removeMemberSchema,
  reorderPlaylistSchema,
  updateChannelSchema,
  updatePlaylistSchema,
  updateUploadSchema,
  uploadQuerySchema,
  userSearchSchema,
} from '@/schemas/dashboard';
import {
  client,
  completeMultipartMediaUpload,
  deleteUpload,
  handleMultipartMediaUpload,
  importMedia,
} from '@/temporal';
import logger from '@/util/logger';
import { ingestS3, PART_SIZE, publicS3 } from '@/util/s3';
import { getPublicImageUrl, getPublicMediaUrl } from '@/util/url';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/channel',
});

const { ADMIN_EMAIL, WEB_URL } = z
  .object({
    ADMIN_EMAIL: z.email(),
    WEB_URL: z.url(),
  })
  .parse(process.env);

const channelProcedure = authProcedure
  .input(channelQuerySchema)
  .use(async ({ ctx, input, next }) => {
    const isSiteAdmin = ctx.session.appUser.role === 'ADMIN';
    const membership = await prisma.channelMembership.findFirst({
      where: { appUserId: ctx.session.appUserId, channelId: input.channelId },
    });

    if (!membership && !isSiteAdmin) {
      moduleLogger.warn('No membership found for channel procedure', {
        ...input,
      });

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({ ctx: { ...ctx, membership } });
  });

const channelAdminProcedure = channelProcedure.use(async ({ ctx, next }) => {
  const isSiteAdmin = ctx.session.appUser.role === 'ADMIN';
  const isChannelAdmin = ctx.membership?.isAdmin ?? false;

  if (!isChannelAdmin && !isSiteAdmin) {
    moduleLogger.warn('User is not admin of channel', {
      appUserId: ctx.session.appUserId,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

const channelUploadProcedure = channelProcedure.use(async ({ ctx, next }) => {
  const isSiteAdmin = ctx.session.appUser.role === 'ADMIN';
  const canUpload =
    ctx.membership?.isAdmin || ctx.membership?.canUpload || false;

  if (!canUpload && !isSiteAdmin) {
    moduleLogger.warn('User cannot upload to channel', {
      appUserId: ctx.session.appUserId,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

const channelEditProcedure = channelProcedure.use(async ({ ctx, next }) => {
  const isSiteAdmin = ctx.session.appUser.role === 'ADMIN';
  const canEdit = ctx.membership?.isAdmin || ctx.membership?.canEdit || false;

  if (!canEdit && !isSiteAdmin) {
    moduleLogger.warn('User cannot edit content in channel', {
      appUserId: ctx.session.appUserId,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const channelRouter = router({
  createChannel: authProcedure
    .input(createChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Creating channel', {
        appUserId: ctx.session.appUserId,
        name: input.name,
      });

      try {
        const channel = await prisma.channel.create({
          data: {
            name: input.name,
            slug: input.slug,
            description: input.description || null,
            visibility: input.visibility,
            memberships: {
              create: {
                appUserId: ctx.session.appUserId,
                isAdmin: true,
                canEdit: true,
                canUpload: true,
              },
            },
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        });

        moduleLogger.info('Channel created successfully', {
          appUserId: ctx.session.appUserId,
          channelId: channel.id,
        });

        // Send admin notification email
        try {
          const user = await prisma.appUser.findUnique({
            where: { id: ctx.session.appUserId },
            select: {
              username: true,
              fullName: true,
              emails: {
                where: { verifiedAt: { not: null } },
                select: { email: true },
                take: 1,
              },
            },
          });

          const approvalUrl = `${WEB_URL}/dashboard/admin/channels?filter=pending`;
          const subject = `New Channel Approval Request: ${channel.name}`;
          const text = stripIndent`
            A new channel has been created and is pending approval.

            Channel Name: ${channel.name}
            Channel Slug: ${channel.slug}
            Creator: ${user?.fullName || user?.username || 'Unknown'}
            ${user?.emails[0]?.email ? `Creator Email: ${user.emails[0].email}` : ''}

            Please visit ${approvalUrl} to review and approve this channel.
          `;
          const html = emailHtml(
            'New Channel Approval Request',
            stripIndent`
              A new channel has been created and is pending approval.

              <b>Channel Name:</b> ${channel.name}<br>
              <b>Channel Slug:</b> ${channel.slug}<br>
              <b>Creator:</b> ${user?.fullName || user?.username || 'Unknown'}<br>
              ${user?.emails[0]?.email ? `<b>Creator Email:</b> ${user.emails[0].email}<br>` : ''}

              Please <a href="${approvalUrl}">click here</a> to review and approve this channel.

              Alternatively, visit: ${approvalUrl}
            `,
          ).html;

          await (await client).workflow.start(sendEmailWorkflow, {
            args: [
              {
                from: 'hello@lets.church',
                to: ADMIN_EMAIL,
                subject,
                text,
                html,
              },
            ],
            workflowId: `channel-approval:${channel.id}:${Date.now()}`,
            taskQueue: BACKGROUND_QUEUE,
            retry: { maximumAttempts: 5 },
          });

          moduleLogger.info('Admin notification email workflow started', {
            channelId: channel.id,
            adminEmail: ADMIN_EMAIL,
          });
        } catch (emailError) {
          // Log but don't fail the channel creation if email fails
          moduleLogger.error('Failed to send admin notification email', {
            channelId: channel.id,
            error:
              emailError instanceof Error
                ? emailError.message
                : String(emailError),
          });
        }

        return channel;
      } catch (error) {
        moduleLogger.error('Failed to create channel', {
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create channel',
        });
      }
    }),

  getChannels: authProcedure.query(({ ctx }) => {
    moduleLogger.info('Fetching channels for user', {
      appUserId: ctx.session.appUserId,
    });

    return prisma.channel.findMany({
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
    const isSiteAdmin = ctx.session.appUser.role === 'ADMIN';

    const channel = await prisma.channel.findFirst({
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
        approvedAt: true,
        approvedById: true,
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
            uploadLists: true,
          },
        },
      },
      where: {
        id: input.channelId,
        // Only filter by membership for non-admin users
        ...(isSiteAdmin
          ? {}
          : {
              memberships: {
                some: {
                  appUserId: ctx.session.appUser.id,
                },
              },
            }),
      },
    });

    if (!channel) {
      moduleLogger.warn('No channel found for user', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const totalViews = await prisma.uploadView.count({
      where: {
        upload: {
          channelId: input.channelId,
        },
      },
    });

    return { ...channel, userMembership: ctx.membership, totalViews };
  }),

  getChannelForEdit: channelAdminProcedure.query(async ({ ctx, input }) => {
    const isSiteAdmin = ctx.session.appUser.role === 'ADMIN';

    const channel = await prisma.channel.findFirst({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        visibility: true,
        avatarPath: true,
      },
      where: {
        id: input.channelId,
        // Only filter by admin membership for non-site-admin users
        ...(isSiteAdmin
          ? {}
          : {
              memberships: {
                some: {
                  appUserId: ctx.session.appUser.id,
                  isAdmin: true,
                },
              },
            }),
      },
    });

    if (!channel) {
      moduleLogger.warn('Channel not found for editing', {
        ...input,
      });

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const { avatarPath, ...restChannel } = channel;

    const avatarUrl = avatarPath
      ? getPublicImageUrl(
          publicS3.getS3ProtocolUri(avatarPath),
          getAvatarResize(input?.avatarSize),
        )
      : null;

    return { ...restChannel, avatarUrl };
  }),

  updateChannel: channelAdminProcedure
    .input(updateChannelSchema)
    .mutation(async ({ ctx, input }) => {
      const updatedChannel = await prisma.channel.update({
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
    const channel = await prisma.channel.findFirst({
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
    .query(async ({ ctx, input }) => {
      moduleLogger.info('Searching users for channel', {
        channelId: input.channelId,
        query: input.query,
        appUserId: ctx.session.appUserId,
      });

      const users = await prisma.appUser.findMany({
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

      moduleLogger.info('User search completed', {
        channelId: input.channelId,
        query: input.query,
        resultCount: users.length,
        appUserId: ctx.session.appUserId,
      });

      return users;
    }),

  addChannelMember: channelAdminProcedure
    .input(addMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Adding channel member', {
        channelId: input.channelId,
        newMemberUserId: input.userId,
        isAdmin: input.isAdmin,
        canEdit: input.canEdit,
        canUpload: input.canUpload,
        addedBy: ctx.session.appUserId,
      });

      try {
        await prisma.channelMembership.create({
          data: {
            channelId: input.channelId,
            appUserId: input.userId,
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
            canUpload: input.canUpload,
          },
        });

        moduleLogger.info('Channel member added successfully', {
          channelId: input.channelId,
          newMemberUserId: input.userId,
          addedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to add channel member', {
          channelId: input.channelId,
          newMemberUserId: input.userId,
          addedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  removeChannelMember: channelAdminProcedure
    .input(removeMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Removing channel member', {
        channelId: input.channelId,
        memberToRemove: input.appUserId,
        removedBy: ctx.session.appUserId,
      });

      try {
        // Don't allow removing the last admin
        const adminCount = await prisma.channelMembership.count({
          where: {
            channelId: input.channelId,
            isAdmin: true,
          },
        });

        const membershipToDelete = await prisma.channelMembership.findUnique({
          where: {
            channelId_appUserId: {
              channelId: input.channelId,
              appUserId: input.appUserId,
            },
          },
          select: { isAdmin: true, appUserId: true },
        });

        if (membershipToDelete?.isAdmin && adminCount <= 1) {
          moduleLogger.warn('Cannot remove last admin from channel', {
            channelId: input.channelId,
            memberToRemove: input.appUserId,
            removedBy: ctx.session.appUserId,
          });
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot remove the last admin from the channel',
          });
        }

        // Don't allow removing yourself
        if (membershipToDelete?.appUserId === ctx.session.appUser.id) {
          moduleLogger.warn(
            'User attempted to remove themselves from channel',
            {
              channelId: input.channelId,
              appUserId: ctx.session.appUserId,
            },
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You cannot remove yourself from the channel',
          });
        }

        await prisma.channelMembership.delete({
          where: {
            channelId_appUserId: {
              channelId: input.channelId,
              appUserId: input.appUserId,
            },
          },
        });

        moduleLogger.info('Channel member removed successfully', {
          channelId: input.channelId,
          memberRemoved: input.appUserId,
          removedBy: ctx.session.appUserId,
          wasAdmin: membershipToDelete?.isAdmin,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error('Failed to remove channel member', {
          channelId: input.channelId,
          memberToRemove: input.appUserId,
          removedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  getChannelUploads: channelProcedure
    .input(channelUploadsQuerySchema)
    .query(async ({ ctx, input }) => {
      const channel = await prisma.channel.findFirst({
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
        prisma.uploadRecord.findMany({
          select: {
            id: true,
            title: true,
            description: true,
            visibility: true,
            createdAt: true,
            lengthSeconds: true,
            defaultThumbnailPath: true,
            overrideThumbnailPath: true,
            featuredUpload: {
              select: {
                uploadRecordId: true,
              },
            },
            _count: {
              select: {
                uploadViews: true,
                userComments: true,
              },
            },
          },
          where: {
            channelId: input.channelId,
            ...(input.search && {
              title: {
                contains: input.search,
                mode: 'insensitive',
              },
            }),
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
        prisma.uploadRecord.count({
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

      const uploadsWithThumbnails = uploads.map((upload) => {
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          featuredUpload,
          ...uploadRest
        } = upload;
        const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;
        const thumbnailUrl = thumbnailPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(thumbnailPath),
              getThumbnailResize('table'),
            )
          : null;

        return {
          ...uploadRest,
          thumbnailUrl,
          isFeatured: !!featuredUpload,
        };
      });

      return {
        channel: {
          ...channel,
          userMembership: ctx.membership,
        },
        uploads: uploadsWithThumbnails,
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
      const { id } = await prisma.uploadRecord.create({
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
      const upload = await prisma.uploadRecord.findFirst({
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

  bulkSetVisibility: channelEditProcedure
    .input(bulkSetVisibilitySchema)
    .mutation(async ({ input }) => {
      // Verify all uploads belong to this channel
      const uploads = await prisma.uploadRecord.findMany({
        select: {
          id: true,
          channelId: true,
        },
        where: {
          id: { in: input.uploadIds },
          channelId: input.channelId,
        },
      });

      if (uploads.length !== input.uploadIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Some uploads not found or do not belong to this channel',
        });
      }

      // Update visibility for all uploads
      await prisma.uploadRecord.updateMany({
        where: {
          id: { in: input.uploadIds },
          channelId: input.channelId,
        },
        data: {
          visibility: input.visibility,
        },
      });

      return {
        success: true,
        updatedCount: input.uploadIds.length,
        visibility: input.visibility,
      };
    }),

  getUploadRecord: channelEditProcedure
    .input(uploadQuerySchema)
    .query(async ({ ctx, input }) => {
      const upload = await prisma.uploadRecord.findFirst({
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
          variants: true,
          featuredUpload: {
            select: {
              uploadRecordId: true,
            },
          },
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
                      role: true,
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

      const {
        defaultThumbnailPath,
        overrideThumbnailPath,
        featuredUpload,
        variants,
        ...uploadRest
      } = upload;
      const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;

      const thumbnailUrl = thumbnailPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(thumbnailPath))
        : null;

      // Generate media source URLs based on available variants
      const hasVideo = variants.some((v) => v.startsWith('VIDEO'));
      const hasAudio = variants.includes('AUDIO');

      const mediaSource = hasVideo
        ? getPublicMediaUrl(`${upload.id}/master.m3u8`)
        : null;

      const audioSource = hasAudio
        ? getPublicMediaUrl(`${upload.id}/AUDIO.m3u8`)
        : null;

      return {
        upload: {
          ...uploadRest,
          thumbnailUrl,
          isFeatured: !!featuredUpload,
          mediaSource,
          audioSource,
        },
        channel: {
          ...upload.channel,
          userMembership,
        },
      };
    }),

  updateUploadRecord: channelEditProcedure
    .input(updateUploadSchema)
    .mutation(async ({ input }) => {
      const upload = await prisma.uploadRecord.findFirst({
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

      const updatedUpload = await prisma.uploadRecord.update({
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

  createMultipartUpload: channelAdminProcedure
    .input(
      multipartUploadSchema.and(
        z.object({
          postProcess: z.enum(['media', 'thumbnail', 'channelAvatar']),
        }),
      ),
    )
    .mutation(
      async ({ input: { targetId, uploadMimeType, bytes, postProcess } }) => {
        const { uploadKey, uploadId } = await ingestS3.createMultipartUpload(
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

        const urls = await ingestS3.createPresignedPartUploadUrls(
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

  finalizeMultipartUpload: channelAdminProcedure
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

  // Playlist procedures
  getChannelPlaylists: channelProcedure.query(async ({ ctx, input }) => {
    moduleLogger.info('Fetching channel playlists', {
      channelId: input.channelId,
      appUserId: ctx.session.appUserId,
    });

    const playlists = await prisma.uploadList.findMany({
      select: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            uploads: true,
          },
        },
      },
      where: {
        channelId: input.channelId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return playlists;
  }),

  getPlaylistDetails: channelProcedure
    .input(playlistQuerySchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info('Fetching playlist details', {
        playlistId: input.playlistId,
        channelId: input.channelId,
        appUserId: ctx.session.appUserId,
      });

      const playlist = await prisma.uploadList.findFirst({
        select: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          updatedAt: true,
          uploads: {
            select: {
              upload: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  visibility: true,
                  createdAt: true,
                  lengthSeconds: true,
                  defaultThumbnailPath: true,
                  overrideThumbnailPath: true,
                },
              },
              rank: true,
            },
            orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
          },
        },
        where: {
          id: input.playlistId,
          channelId: input.channelId,
        },
      });

      if (!playlist) {
        moduleLogger.warn('Playlist not found', {
          playlistId: input.playlistId,
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        });
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Playlist not found',
        });
      }

      return playlist;
    }),

  createPlaylist: channelEditProcedure
    .input(createPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Creating playlist', {
        channelId: input.channelId,
        playlistTitle: input.title,
        playlistType: input.type,
        createdBy: ctx.session.appUserId,
      });

      try {
        const playlist = await prisma.uploadList.create({
          data: {
            title: input.title,
            type: input.type,
            authorId: ctx.session.appUser.id,
            channelId: input.channelId,
          },
          select: {
            id: true,
            title: true,
            type: true,
            createdAt: true,
          },
        });

        moduleLogger.info('Playlist created successfully', {
          playlistId: playlist.id,
          channelId: input.channelId,
          playlistTitle: input.title,
          createdBy: ctx.session.appUserId,
        });

        return { success: true, playlist };
      } catch (error) {
        moduleLogger.error('Failed to create playlist', {
          channelId: input.channelId,
          playlistTitle: input.title,
          createdBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  updatePlaylist: channelEditProcedure
    .input(updatePlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Updating playlist', {
        playlistId: input.playlistId,
        playlistTitle: input.title,
        playlistType: input.type,
        updatedBy: ctx.session.appUserId,
      });

      try {
        const updatedPlaylist = await prisma.uploadList.update({
          where: { id: input.playlistId },
          data: {
            title: input.title,
            type: input.type,
          },
          select: {
            id: true,
            title: true,
            type: true,
            updatedAt: true,
          },
        });

        moduleLogger.info('Playlist updated successfully', {
          playlistId: input.playlistId,
          playlistTitle: input.title,
          updatedBy: ctx.session.appUserId,
        });

        return { success: true, playlist: updatedPlaylist };
      } catch (error) {
        moduleLogger.error('Failed to update playlist', {
          playlistId: input.playlistId,
          playlistTitle: input.title,
          updatedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  deletePlaylist: channelEditProcedure
    .input(deletePlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Deleting playlist', {
        playlistId: input.playlistId,
        deletedBy: ctx.session.appUserId,
      });

      try {
        await prisma.uploadList.delete({
          where: { id: input.playlistId },
        });

        moduleLogger.info('Playlist deleted successfully', {
          playlistId: input.playlistId,
          deletedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to delete playlist', {
          playlistId: input.playlistId,
          deletedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  addToPlaylist: channelEditProcedure
    .input(addToPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Adding upload to playlist', {
        playlistId: input.playlistId,
        uploadId: input.uploadId,
        addedBy: ctx.session.appUserId,
      });

      try {
        // Get the playlist to verify it exists and get its channelId
        const playlist = await prisma.uploadList.findUnique({
          where: { id: input.playlistId },
          select: { id: true, channelId: true },
        });

        if (!playlist?.channelId) {
          moduleLogger.warn('Playlist not found for add to playlist', {
            playlistId: input.playlistId,
            uploadId: input.uploadId,
            addedBy: ctx.session.appUserId,
          });
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Playlist not found',
          });
        }

        // Verify the upload belongs to the same channel
        const upload = await prisma.uploadRecord.findFirst({
          where: {
            id: input.uploadId,
            channelId: playlist.channelId,
          },
          select: { id: true },
        });

        if (!upload) {
          moduleLogger.warn('Upload not found or channel mismatch', {
            playlistId: input.playlistId,
            uploadId: input.uploadId,
            channelId: playlist.channelId,
            addedBy: ctx.session.appUserId,
          });
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found or does not belong to this channel',
          });
        }

        // Check if upload is already in playlist
        const existingEntry = await prisma.uploadListEntry.findUnique({
          where: {
            uploadListId_uploadRecordId: {
              uploadListId: input.playlistId,
              uploadRecordId: input.uploadId,
            },
          },
        });

        if (existingEntry) {
          moduleLogger.warn('Upload already in playlist', {
            playlistId: input.playlistId,
            uploadId: input.uploadId,
            addedBy: ctx.session.appUserId,
          });
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload is already in this playlist',
          });
        }

        await prisma.uploadListEntry.create({
          data: {
            uploadListId: input.playlistId,
            uploadRecordId: input.uploadId,
          },
        });

        moduleLogger.info('Upload added to playlist successfully', {
          playlistId: input.playlistId,
          uploadId: input.uploadId,
          addedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error('Failed to add upload to playlist', {
          playlistId: input.playlistId,
          uploadId: input.uploadId,
          addedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  removeFromPlaylist: channelEditProcedure
    .input(removeFromPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Removing upload from playlist', {
        playlistId: input.playlistId,
        uploadId: input.uploadId,
        removedBy: ctx.session.appUserId,
      });

      try {
        const deletedEntry = await prisma.uploadListEntry.deleteMany({
          where: {
            uploadListId: input.playlistId,
            uploadRecordId: input.uploadId,
          },
        });

        if (deletedEntry.count === 0) {
          moduleLogger.warn('Upload not found in playlist for removal', {
            playlistId: input.playlistId,
            uploadId: input.uploadId,
            removedBy: ctx.session.appUserId,
          });
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found in playlist',
          });
        }

        moduleLogger.info('Upload removed from playlist successfully', {
          playlistId: input.playlistId,
          uploadId: input.uploadId,
          removedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error('Failed to remove upload from playlist', {
          playlistId: input.playlistId,
          uploadId: input.uploadId,
          removedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  reorderPlaylist: channelEditProcedure
    .input(reorderPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Reordering playlist', {
        playlistId: input.playlistId,
        uploadCount: input.uploadIds.length,
        reorderedBy: ctx.session.appUserId,
      });

      try {
        await prisma.$transaction(
          input.uploadIds.map((uploadId, index) =>
            prisma.uploadListEntry.update({
              where: {
                uploadListId_uploadRecordId: {
                  uploadListId: input.playlistId,
                  uploadRecordId: uploadId,
                },
              },
              data: {
                rank: index,
              },
            }),
          ),
        );

        moduleLogger.info('Playlist reordered successfully', {
          playlistId: input.playlistId,
          uploadCount: input.uploadIds.length,
          reorderedBy: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to reorder playlist', {
          playlistId: input.playlistId,
          uploadCount: input.uploadIds.length,
          reorderedBy: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

  approveChannel: authProcedure
    .input(channelQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can approve channels
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn('Non-admin user attempted to approve channel', {
          appUserId: ctx.session.appUserId,
          role: ctx.session.appUser.role,
        });
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Approving channel', {
        channelId: input.channelId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await prisma.channel.update({
          where: {
            id: input.channelId,
          },
          data: {
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
          },
        });

        moduleLogger.info('Channel approved successfully', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to approve channel', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve channel',
        });
      }
    }),

  unapproveChannel: authProcedure
    .input(channelQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can unapprove channels
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn('Non-admin user attempted to unapprove channel', {
          appUserId: ctx.session.appUserId,
          role: ctx.session.appUser.role,
        });
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Unapproving channel', {
        channelId: input.channelId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await prisma.channel.update({
          where: {
            id: input.channelId,
          },
          data: {
            approvedAt: null,
            approvedById: null,
          },
        });

        moduleLogger.info('Channel unapproved successfully', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to unapprove channel', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unapprove channel',
        });
      }
    }),

  importMedia: channelUploadProcedure
    .input(importMediaSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { channelId, url, ...workflowData } = input;

        // Get channel and user info for the workflow
        const [channel, user] = await Promise.all([
          prisma.channel.findUniqueOrThrow({
            where: { id: channelId },
            select: { slug: true },
          }),
          prisma.appUser.findUniqueOrThrow({
            where: { id: ctx.session.appUserId },
            select: { username: true },
          }),
        ]);

        // Start the import workflow
        await importMedia({
          url,
          username: user.username,
          channelSlug: channel.slug,
          taskQueue: BACKGROUND_QUEUE,
          ...workflowData,
        });

        moduleLogger.info('Import workflow started', {
          url,
          channelId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to start import workflow', {
          url: input.url,
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start import',
        });
      }
    }),
});
