import {
  Channel,
  ChannelInvitation,
  ChannelMembership,
  db,
  UploadLicense,
  UploadList,
  UploadListEntry,
  UploadRecord,
  UploadView,
} from '@letschurch/db';
import { PART_SIZE } from '@letschurch/s3';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { BACKGROUND_QUEUE } from '@letschurch/temporal/queues';
import { emailHtml, sanitizeForHtml } from '@letschurch/temporal/util/email';
import { sendEmailWorkflow } from '@letschurch/temporal/workflows/background/send-email';
import { TRPCError } from '@trpc/server';
import { and, count, eq, ilike, inArray } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { stripIndent } from 'proper-tags';
import sanitizeFilename from 'sanitize-filename';
import { z } from 'zod';
import {
  finalizeMultipartUploadSchema,
  getThumbnailResize,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  addToPlaylistSchema,
  bulkSetVisibilitySchema,
  cancelChannelInvitationSchema,
  channelQuerySchema,
  channelUploadsQuerySchema,
  createChannelSchema,
  createPlaylistSchema,
  createUploadSchema,
  deletePlaylistSchema,
  deleteUploadSchema,
  importMediaSchema,
  inviteChannelMemberSchema,
  playlistQuerySchema,
  removeFromPlaylistSchema,
  removeMemberSchema,
  reorderPlaylistSchema,
  resendChannelInvitationSchema,
  updateChannelSchema,
  updatePlaylistSchema,
  updateUploadSchema,
  uploadQuerySchema,
} from '@/schemas/dashboard';
import {
  client,
  completeMultipartMediaUpload,
  deleteUpload,
  handleMultipartMediaUpload,
  importMedia,
  makeProcessMediaWorkflowId,
  sendInvitationEmail,
} from '@/temporal';
import {
  mantineAvatarLg2x,
  mantineAvatarSm2x,
  mantineAvatarXl2x,
} from '@/util/avatar-sizes';
import { coverImageFull, thumbnailMedium } from '@/util/image-sizes';
import logger from '@/util/logger';
import { getPublicImageUrl, getPublicMediaUrl } from '@/util/server-env';
import { uuidTranslator } from '@/util/uuid';
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
    // Skip membership query for site admins
    const membership = ctx.isSiteAdmin
      ? null
      : await db.query.ChannelMembership.findFirst({
          where: (t, { and, eq }) =>
            and(
              eq(t.appUserId, ctx.session.appUserId),
              eq(t.channelId, input.channelId),
            ),
        });

    if (!ctx.isSiteAdmin && !membership) {
      moduleLogger.warn('No membership found for channel procedure');

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    // Compute permissions (site admins and channel admins have all permissions)
    const canAdmin = ctx.isSiteAdmin || !!membership?.isAdmin;
    const canEdit = canAdmin || !!membership?.canEdit;
    const canUpload = canAdmin || !!membership?.canUpload;
    const canDownload = canAdmin || !!membership?.canDownload;

    return next({
      ctx: {
        ...ctx,
        membership,
        canAdmin,
        canEdit,
        canUpload,
        canDownload,
      },
    });
  });

const channelAdminProcedure = channelProcedure.use(async ({ ctx, next }) => {
  if (!ctx.canAdmin) {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
      },
      'User is not admin of channel',
    );

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

const channelUploadProcedure = channelProcedure.use(async ({ ctx, next }) => {
  if (!ctx.canUpload) {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
      },
      'User cannot upload to channel',
    );

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

const channelEditProcedure = channelProcedure.use(async ({ ctx, next }) => {
  if (!ctx.canEdit) {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
      },
      'User cannot edit content in channel',
    );

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const channelRouter = router({
  createChannel: authProcedure
    .input(createChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            name: input.name,
          },
        },
        'Creating channel',
      );

      try {
        const channel = await db.transaction(async (tx) => {
          const [newChannel] = await tx
            .insert(Channel)
            .values({
              name: input.name,
              slug: input.slug,
              description: input.description || null,
              visibility: input.visibility,
              updatedAt: new Date(),
            })
            .returning({
              id: Channel.id,
              name: Channel.name,
              slug: Channel.slug,
            });

          if (!newChannel) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
          }

          await tx.insert(ChannelMembership).values({
            channelId: newChannel.id,
            appUserId: ctx.session.appUserId,
            isAdmin: true,
            canEdit: true,
            canUpload: true,
            canDownload: false,
            updatedAt: new Date(),
          });

          return newChannel;
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            channelId: channel.id,
          },
          'Channel created successfully',
        );

        // Send admin notification email
        try {
          const user = await db.query.AppUser.findFirst({
            where: (t, { eq }) => eq(t.id, ctx.session.appUserId),
            columns: {
              username: true,
              fullName: true,
            },
            with: {
              emails: {
                columns: { email: true, verifiedAt: true },
                where: (t, { isNotNull }) => isNotNull(t.verifiedAt),
                limit: 1,
              },
            },
          });

          const verifiedEmail = user?.emails[0] ?? null;

          const approvalUrl = `${WEB_URL}/dashboard/admin/channels?filter=pending`;
          const subject = `New Channel Approval Request: ${channel.name}`;
          const text = stripIndent`
            A new channel has been created and is pending approval.

            Channel Name: ${channel.name}
            Channel Slug: ${channel.slug}
            Creator: ${user?.fullName || user?.username || 'Unknown'}
            ${verifiedEmail?.email ? `Creator Email: ${verifiedEmail.email}` : ''}

            Please visit ${approvalUrl} to review and approve this channel.
          `;
          const html = emailHtml(
            'New Channel Approval Request',
            stripIndent`
              A new channel has been created and is pending approval.

              <b>Channel Name:</b> ${sanitizeForHtml(channel.name)}<br>
              <b>Channel Slug:</b> ${sanitizeForHtml(channel.slug)}<br>
              <b>Creator:</b> ${sanitizeForHtml(user?.fullName || user?.username || 'Unknown')}<br>
              ${verifiedEmail?.email ? `<b>Creator Email:</b> ${sanitizeForHtml(verifiedEmail.email)}<br>` : ''}

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

          moduleLogger.info(
            {
              channelId: channel.id,
              context: {
                adminEmail: ADMIN_EMAIL,
              },
            },
            'Admin notification email workflow started',
          );
        } catch (emailError) {
          // Log but don't fail the channel creation if email fails
          moduleLogger.error(
            {
              channelId: channel.id,
              context: {
                error:
                  emailError instanceof Error
                    ? emailError.message
                    : String(emailError),
              },
            },
            'Failed to send admin notification email',
          );
        }

        return channel;
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to create channel',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create channel',
        });
      }
    }),

  getChannels: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching channels for user',
    );

    // Get channels where user has a membership
    const memberships = await db.query.ChannelMembership.findMany({
      columns: {
        channelId: true,
        isAdmin: true,
        canEdit: true,
        canUpload: true,
      },
      where: (t, { eq }) => eq(t.appUserId, ctx.session.appUser.id),
    });

    if (memberships.length === 0) {
      return [];
    }

    const channelIds = memberships.map((m) => m.channelId);

    const channels = await db.query.Channel.findMany({
      columns: {
        id: true,
        name: true,
        approvedAt: true,
      },
      where: (t, { inArray }) => inArray(t.id, channelIds),
      orderBy: (t, { asc }) => [asc(t.name)],
    });

    return channels.map((channel) => ({
      ...channel,
      memberships: memberships
        .filter((m) => m.channelId === channel.id)
        .map(({ channelId: _, ...m }) => m),
    }));
  }),

  getChannelDetails: channelProcedure.query(async ({ ctx, input }) => {
    const isSiteAdmin = ctx.isSiteAdmin;

    const channel = await db.query.Channel.findFirst({
      columns: {
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
      },
      with: {
        memberships: {
          columns: {
            isAdmin: true,
            canEdit: true,
            canUpload: true,
          },
          with: {
            appUser: {
              columns: {
                id: true,
                username: true,
                fullName: true,
              },
              with: {
                emails: {
                  columns: {
                    email: true,
                    verifiedAt: true,
                  },
                },
              },
            },
          },
        },
        subscribers: {
          columns: {
            appUserId: true,
          },
        },
        uploadRecords: {
          columns: {
            id: true,
            title: true,
            createdAt: true,
            deletedAt: true,
          },
          orderBy: (t, { desc }) => [desc(t.createdAt)],
          limit: 10,
        },
      },
      where: (t, { eq }) => eq(t.id, input.channelId),
    });

    if (!channel) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'No channel found for user',
      );

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // For non-admins, verify membership
    if (!isSiteAdmin) {
      const hasMembership = channel.memberships.some(
        (m) => m.appUser.id === ctx.session.appUser.id,
      );
      if (!hasMembership) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }

    // Count total views for this channel
    const [viewCountResult] = await db
      .select({ count: count() })
      .from(UploadView)
      .innerJoin(UploadRecord, eq(UploadView.uploadRecordId, UploadRecord.id))
      .where(eq(UploadRecord.channelId, input.channelId));

    const totalViews = viewCountResult?.count;

    // Filter deleted uploads
    const filteredUploadRecords = channel.uploadRecords.filter(
      (u) => u.deletedAt === null,
    );

    // Counts
    const uploadRecordCount = filteredUploadRecords.length;
    const subscriberCount = channel.subscribers.length;
    const membershipCount = channel.memberships.length;

    const { avatarPath, ...channelWithoutPath } = channel;
    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarXl2x,
        })
      : null;

    return {
      ...channelWithoutPath,
      uploadRecords: filteredUploadRecords,
      _count: {
        uploadRecords: uploadRecordCount,
        subscribers: subscriberCount,
        memberships: membershipCount,
        uploadLists: 0, // Will be fetched separately if needed
      },
      avatarUrl,
      userMembership: ctx.membership,
      totalViews,
    };
  }),

  getChannelForEdit: channelAdminProcedure.query(async ({ ctx, input }) => {
    const isSiteAdmin = ctx.isSiteAdmin;

    const channel = await db.query.Channel.findFirst({
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        visibility: true,
        websiteUrl: true,
        facebookUrl: true,
        instagramUrl: true,
        xUrl: true,
        youtubeUrl: true,
        tiktokUrl: true,
        linkedinUrl: true,
        threadsUrl: true,
        applePodcastsUrl: true,
        spotifyUrl: true,
        rssUrl: true,
        avatarPath: true,
        coverPath: true,
        defaultThumbnailPath: true,
        defaultUploadVisibility: true,
        defaultUploadLicense: true,
        defaultUploadCommentsEnabled: true,
        defaultUploadDownloadsEnabled: true,
      },
      with: {
        memberships: {
          columns: {
            appUserId: true,
            isAdmin: true,
          },
        },
      },
      where: (t, { eq }) => eq(t.id, input.channelId),
    });

    if (!channel) {
      moduleLogger.warn('Channel not found for editing');

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // For non-site-admins, verify admin membership
    if (!isSiteAdmin) {
      const isAdmin = channel.memberships.some(
        (m) => m.appUserId === ctx.session.appUser.id && m.isAdmin,
      );
      if (!isAdmin) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }

    const {
      avatarPath,
      coverPath,
      defaultThumbnailPath,
      memberships: _,
      ...restChannel
    } = channel;

    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarLg2x,
        })
      : null;

    const coverUrl = coverPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(coverPath), {
          resize: coverImageFull,
        })
      : null;

    const defaultThumbnailUrl = defaultThumbnailPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(defaultThumbnailPath), {
          resize: thumbnailMedium,
        })
      : null;

    return { ...restChannel, avatarUrl, coverUrl, defaultThumbnailUrl };
  }),

  updateChannel: channelAdminProcedure
    .input(updateChannelSchema)
    .mutation(async ({ input }) => {
      const [updatedChannel] = await db
        .update(Channel)
        .set({
          name: input.name,
          slug: input.slug,
          description: input.description,
          visibility: input.visibility,
          websiteUrl: input.websiteUrl || null,
          facebookUrl: input.facebookUrl || null,
          instagramUrl: input.instagramUrl || null,
          xUrl: input.xUrl || null,
          youtubeUrl: input.youtubeUrl || null,
          tiktokUrl: input.tiktokUrl || null,
          linkedinUrl: input.linkedinUrl || null,
          threadsUrl: input.threadsUrl || null,
          applePodcastsUrl: input.applePodcastsUrl || null,
          spotifyUrl: input.spotifyUrl || null,
          rssUrl: input.rssUrl || null,
          defaultUploadVisibility: input.defaultUploadVisibility ?? null,
          defaultUploadLicense: input.defaultUploadLicense ?? null,
          defaultUploadCommentsEnabled:
            input.defaultUploadCommentsEnabled ?? null,
          defaultUploadDownloadsEnabled:
            input.defaultUploadDownloadsEnabled ?? null,
          updatedAt: new Date(),
        })
        .where(eq(Channel.id, input.channelId))
        .returning({
          id: Channel.id,
          name: Channel.name,
          slug: Channel.slug,
          description: Channel.description,
          visibility: Channel.visibility,
          websiteUrl: Channel.websiteUrl,
        });

      if (!updatedChannel) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
      return { success: true, channel: updatedChannel };
    }),

  getChannelMembers: channelProcedure.query(async ({ ctx, input }) => {
    const channel = await db.query.Channel.findFirst({
      columns: {
        id: true,
        name: true,
        slug: true,
      },
      with: {
        memberships: {
          columns: {
            channelId: true,
            appUserId: true,
            isAdmin: true,
            canEdit: true,
            canUpload: true,
            createdAt: true,
          },
          with: {
            appUser: {
              columns: {
                id: true,
                username: true,
                fullName: true,
                avatarPath: true,
              },
            },
          },
        },
      },
      where: (t, { eq }) => eq(t.id, input.channelId),
    });

    if (!channel) {
      moduleLogger.warn('Channel not found for members');

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Sort: admins first, then by createdAt
    const sortedMemberships = [...channel.memberships].sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const membershipsWithAvatarUrl = sortedMemberships.map((membership) => {
      const { avatarPath, ...userWithoutPath } = membership.appUser;
      const avatarUrl = avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
            resize: mantineAvatarSm2x,
          })
        : null;

      return {
        ...membership,
        appUser: {
          ...userWithoutPath,
          avatarUrl,
        },
      };
    });

    return {
      ...channel,
      memberships: membershipsWithAvatarUrl,
      userMembership: ctx.membership,
      canAdmin: ctx.canAdmin,
    };
  }),

  inviteToChannel: channelAdminProcedure
    .input(inviteChannelMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          context: {
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
            canUpload: input.canUpload,
            canDownload: input.canDownload,
          },
        },
        'Inviting user to channel',
      );

      // Check if email already belongs to a member
      // Find user by email first, then check if they're a member
      const emailRecord = await db.query.AppUserEmail.findFirst({
        columns: { appUserId: true },
        where: (t, { eq }) => eq(t.email, input.email),
      });

      if (emailRecord) {
        const existingMember = await db.query.ChannelMembership.findFirst({
          columns: { channelId: true },
          where: (t, { and, eq }) =>
            and(
              eq(t.channelId, input.channelId),
              eq(t.appUserId, emailRecord.appUserId),
            ),
        });

        // If already a member, treat as no-op to prevent user enumeration
        if (existingMember) {
          moduleLogger.info(
            {
              channelId: input.channelId,
              appUserId: ctx.session.appUserId,
            },
            'User is already a member of this channel, skipping invitation',
          );
          return { success: true, message: 'Invitation sent successfully' };
        }
      }

      // Check for existing pending invitation
      const existingInvitation = await db.query.ChannelInvitation.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.channelId, input.channelId), eq(t.email, input.email)),
      });

      // If already invited and pending, treat as no-op to prevent user enumeration
      if (
        existingInvitation &&
        existingInvitation.status === 'PENDING' &&
        existingInvitation.expiresAt > new Date()
      ) {
        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
          },
          'Pending invitation already exists for this email, skipping',
        );
        return { success: true, message: 'Invitation sent successfully' };
      }

      // Create or update invitation
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [invitation] = await db
        .insert(ChannelInvitation)
        .values({
          channelId: input.channelId,
          email: input.email,
          isAdmin: input.isAdmin,
          canEdit: input.canEdit,
          canUpload: input.canUpload,
          canDownload: input.canDownload,
          invitedById: ctx.session.appUserId,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [ChannelInvitation.channelId, ChannelInvitation.email],
          set: {
            status: 'PENDING',
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
            canUpload: input.canUpload,
            canDownload: input.canDownload,
            expiresAt,
            respondedAt: null,
            invitedById: ctx.session.appUserId,
          },
        })
        .returning();

      if (!invitation) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }

      // Send invitation email
      await sendInvitationEmail({
        invitationId: invitation.id,
        type: 'channel',
      });

      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          context: {
            invitationId: invitation.id,
          },
        },
        'Channel invitation created and email sent',
      );

      // Return identical success message for security (no user enumeration)
      return { success: true, message: 'Invitation sent successfully' };
    }),

  getChannelInvitations: channelAdminProcedure
    .input(channelQuerySchema)
    .query(async ({ input }) => {
      const invitations = await db.query.ChannelInvitation.findMany({
        columns: {
          id: true,
          email: true,
          isAdmin: true,
          canEdit: true,
          canUpload: true,
          canDownload: true,
          createdAt: true,
          expiresAt: true,
          token: true,
          status: true,
        },
        with: {
          invitedBy: {
            columns: {
              username: true,
              fullName: true,
            },
          },
        },
        where: (t, { and, eq, gt }) =>
          and(
            eq(t.channelId, input.channelId),
            eq(t.status, 'PENDING'),
            gt(t.expiresAt, new Date()),
          ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      return invitations.map(({ token, ...inv }) => ({
        ...inv,
        token: uuidTranslator.fromUUID(token),
      }));
    }),

  cancelChannelInvitation: channelAdminProcedure
    .input(cancelChannelInvitationSchema)
    .mutation(async ({ input }) => {
      // Use update with both id and channelId to ensure the invitation belongs to the channel
      const result = await db
        .update(ChannelInvitation)
        .set({ status: 'CANCELLED' })
        .where(
          and(
            eq(ChannelInvitation.id, input.invitationId),
            eq(ChannelInvitation.channelId, input.channelId),
          ),
        )
        .returning({ id: ChannelInvitation.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      return { success: true };
    }),

  resendChannelInvitation: channelAdminProcedure
    .input(resendChannelInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      // First fetch and validate the invitation
      const existingInvitation = await db.query.ChannelInvitation.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.id, input.invitationId), eq(t.channelId, input.channelId)),
      });

      if (!existingInvitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      if (existingInvitation.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Can only resend pending invitations',
        });
      }

      // Update the expiration
      const [invitation] = await db
        .update(ChannelInvitation)
        .set({
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .where(eq(ChannelInvitation.id, input.invitationId))
        .returning();

      if (!invitation) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }

      // Send invitation email
      await sendInvitationEmail({
        invitationId: invitation.id,
        type: 'channel',
      });

      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          context: {
            invitationId: invitation.id,
          },
        },
        'Channel invitation resent',
      );

      return { success: true };
    }),

  removeChannelMember: channelAdminProcedure
    .input(removeMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          context: {
            memberToRemove: input.appUserId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing channel member',
      );

      try {
        let wasAdmin = false;
        await db.transaction(async (tx) => {
          // Don't allow removing the last admin
          const [adminCountResult] = await tx
            .select({ count: count() })
            .from(ChannelMembership)
            .where(
              and(
                eq(ChannelMembership.channelId, input.channelId),
                eq(ChannelMembership.isAdmin, true),
              ),
            );

          const adminCount = adminCountResult?.count;

          const membershipToDelete = await tx.query.ChannelMembership.findFirst(
            {
              columns: { isAdmin: true, appUserId: true },
              where: (t, { and, eq }) =>
                and(
                  eq(t.channelId, input.channelId),
                  eq(t.appUserId, input.appUserId),
                ),
            },
          );

          if (!membershipToDelete) {
            moduleLogger.warn(
              {
                channelId: input.channelId,
                context: {
                  memberToRemove: input.appUserId,
                  removedBy: ctx.session.appUserId,
                },
              },
              'Membership not found',
            );
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Membership not found',
            });
          }

          wasAdmin = membershipToDelete.isAdmin;

          if (membershipToDelete.isAdmin && adminCount <= 1) {
            moduleLogger.warn(
              {
                channelId: input.channelId,
                context: {
                  memberToRemove: input.appUserId,
                  removedBy: ctx.session.appUserId,
                },
              },
              'Cannot remove last admin from channel',
            );
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot remove the last admin from the channel',
            });
          }

          await tx
            .delete(ChannelMembership)
            .where(
              and(
                eq(ChannelMembership.channelId, input.channelId),
                eq(ChannelMembership.appUserId, input.appUserId),
              ),
            );
        });

        moduleLogger.info(
          {
            channelId: input.channelId,
            context: {
              memberRemoved: input.appUserId,
              removedBy: ctx.session.appUserId,
              wasAdmin,
            },
          },
          'Channel member removed successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            channelId: input.channelId,
            context: {
              memberToRemove: input.appUserId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove channel member',
        );
        throw error;
      }
    }),

  getChannelUploads: channelProcedure
    .input(channelUploadsQuerySchema)
    .query(async ({ ctx, input }) => {
      const channel = await db.query.Channel.findFirst({
        columns: {
          id: true,
          name: true,
          slug: true,
          defaultUploadVisibility: true,
          defaultUploadLicense: true,
          defaultUploadCommentsEnabled: true,
          defaultUploadDownloadsEnabled: true,
        },
        with: {
          memberships: {
            columns: {
              isAdmin: true,
              canEdit: true,
              canUpload: true,
              canDownload: true,
            },
            with: {
              appUser: {
                columns: {
                  id: true,
                  role: true,
                },
              },
            },
          },
        },
        where: (t, { eq }) => eq(t.id, input.channelId),
      });

      if (!channel) {
        moduleLogger.warn('Channel not found for uploads');

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const offset = (input.page - 1) * input.limit;

      const [uploads, totalCountResult] = await Promise.all([
        db.query.UploadRecord.findMany({
          columns: {
            id: true,
            title: true,
            description: true,
            visibility: true,
            createdAt: true,
            lengthSeconds: true,
            finalizedUploadKey: true,
            defaultThumbnailPath: true,
            overrideThumbnailPath: true,
          },
          with: {
            featuredUpload: {
              columns: {
                uploadRecordId: true,
              },
            },
            uploadViews: {
              columns: { uploadRecordId: true },
            },
            userComments: {
              columns: { id: true },
            },
          },
          where: (t, { and, or, eq, ilike }) =>
            and(
              eq(t.channelId, input.channelId),
              ...(input.search ? [ilike(t.title, `%${input.search}%`)] : []),
              or(
                eq(t.visibility, 'PUBLIC'),
                eq(t.visibility, 'UNLISTED'),
                eq(t.visibility, 'PRIVATE'),
              ),
            ),
          orderBy: (t, { desc }) => [desc(t.createdAt)],
          offset,
          limit: input.limit,
        }),
        db
          .select({ count: count() })
          .from(UploadRecord)
          .where(
            and(
              eq(UploadRecord.channelId, input.channelId),
              ...(input.search
                ? [ilike(UploadRecord.title, `%${input.search}%`)]
                : []),
            ),
          )
          .then((r) => r[0]?.count),
      ]);

      const totalCount = Number(totalCountResult ?? 0);
      const totalPages = Math.ceil(totalCount / input.limit);

      const uploadsWithThumbnails = uploads.map((upload) => {
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          featuredUpload,
          uploadViews,
          userComments,
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
          _count: {
            uploadViews: uploadViews.length,
            userComments: userComments.length,
          },
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
      const channel = await db.query.Channel.findFirst({
        columns: {
          defaultUploadVisibility: true,
          defaultUploadLicense: true,
          defaultUploadCommentsEnabled: true,
          defaultUploadDownloadsEnabled: true,
        },
        where: (t, { eq }) => eq(t.id, input.channelId),
      });

      if (!channel) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const [record] = await db
        .insert(UploadRecord)
        .values({
          license: channel.defaultUploadLicense ?? UploadLicense.enumValues[0],
          visibility: channel.defaultUploadVisibility ?? 'PRIVATE',
          userCommentsEnabled: channel.defaultUploadCommentsEnabled ?? true,
          downloadsEnabled: channel.defaultUploadDownloadsEnabled ?? true,
          originalFileName: input.originalFileName,
          channelId: input.channelId,
          appUserId: ctx.session.appUser.id,
          uploadFinalized: false,
          variants: [],
          updatedAt: new Date(),
          score: 0,
          transcodingProgress: 0,
        })
        .returning({ id: UploadRecord.id });

      if (!record) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create upload record',
        });
      }
      return record.id;
    }),

  deleteUploadRecord: channelAdminProcedure
    .input(deleteUploadSchema)
    .mutation(async ({ input }) => {
      // Verify the upload belongs to this channel
      const upload = await db.query.UploadRecord.findFirst({
        columns: {
          id: true,
          channelId: true,
        },
        where: (t, { and, eq }) =>
          and(eq(t.id, input.uploadId), eq(t.channelId, input.channelId)),
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
      if (input.uploadIds.length === 0) {
        return {
          success: true,
          updatedCount: 0,
          visibility: input.visibility,
        };
      }

      // Verify all uploads belong to this channel
      const uploads = await db.query.UploadRecord.findMany({
        columns: {
          id: true,
          channelId: true,
        },
        where: (t, { and, inArray, eq }) =>
          and(inArray(t.id, input.uploadIds), eq(t.channelId, input.channelId)),
      });

      if (uploads.length !== input.uploadIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Some uploads not found or do not belong to this channel',
        });
      }

      // Update visibility for all uploads
      await db
        .update(UploadRecord)
        .set({
          visibility: input.visibility,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(UploadRecord.id, input.uploadIds),
            eq(UploadRecord.channelId, input.channelId),
          ),
        );

      return {
        success: true,
        updatedCount: input.uploadIds.length,
        visibility: input.visibility,
      };
    }),

  getUploadRecord: channelEditProcedure
    .input(uploadQuerySchema)
    .query(async ({ ctx, input }) => {
      const upload = await db.query.UploadRecord.findFirst({
        columns: {
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
          uploadFinalized: true,
          finalizedUploadKey: true,
          transcodingFinishedAt: true,
          transcribingFinishedAt: true,
          transcodingProgress: true,
          variants: true,
        },
        with: {
          featuredUpload: {
            columns: {
              uploadRecordId: true,
            },
          },
          channel: {
            columns: {
              id: true,
              name: true,
            },
            with: {
              memberships: {
                columns: {
                  isAdmin: true,
                  canEdit: true,
                  appUserId: true,
                },
                with: {
                  appUser: {
                    columns: {
                      id: true,
                      role: true,
                    },
                  },
                },
              },
            },
          },
          uploadListEntries: {
            columns: {},
            with: {
              uploadList: {
                columns: {
                  id: true,
                  title: true,
                  type: true,
                  channelId: true,
                },
              },
            },
          },
        },
        where: (t, { and, eq }) =>
          and(eq(t.id, input.uploadId), eq(t.channelId, input.channelId)),
      });

      if (!upload) {
        moduleLogger.warn('Upload not found');

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
        uploadListEntries,
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

      // For site admins, check if there's an active workflow for failed uploads
      let hasActiveWorkflow = false;
      if (
        ctx.isSiteAdmin &&
        upload.uploadFinalized &&
        upload.finalizedUploadKey &&
        (!upload.transcodingFinishedAt || !upload.transcribingFinishedAt)
      ) {
        try {
          const temporalClient = await client;
          const workflowId = makeProcessMediaWorkflowId(
            upload.finalizedUploadKey,
          );
          const handle = temporalClient.workflow.getHandle(workflowId);
          const description = await handle.describe();
          hasActiveWorkflow = description.status.name === 'RUNNING';
        } catch {
          // Workflow doesn't exist
        }
      }

      // Filter uploadListEntries to series belonging to this channel
      const seriesEntries = uploadListEntries.filter(
        (e) =>
          e.uploadList.type === 'SERIES' &&
          e.uploadList.channelId === input.channelId,
      );

      return {
        upload: {
          ...uploadRest,
          thumbnailUrl,
          isFeatured: !!featuredUpload,
          mediaSource,
          audioSource,
          series: seriesEntries.map((e) => ({
            id: e.uploadList.id,
            title: e.uploadList.title,
            type: e.uploadList.type,
          })),
          hasActiveWorkflow,
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
      const upload = await db.query.UploadRecord.findFirst({
        columns: { id: true },
        where: (t, { and, eq }) =>
          and(eq(t.id, input.uploadId), eq(t.channelId, input.channelId)),
      });

      if (!upload) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found or access denied',
        });
      }

      const [updatedUpload] = await db
        .update(UploadRecord)
        .set({
          title: input.title,
          description: input.description,
          license: input.license,
          publishedAt: input.publishedAt,
          visibility: input.visibility,
          userCommentsEnabled: input.userCommentsEnabled,
          downloadsEnabled: input.downloadsEnabled,
          updatedAt: new Date(),
        })
        .where(eq(UploadRecord.id, input.uploadId))
        .returning({
          id: UploadRecord.id,
          title: UploadRecord.title,
          description: UploadRecord.description,
          license: UploadRecord.license,
          visibility: UploadRecord.visibility,
          publishedAt: UploadRecord.publishedAt,
          userCommentsEnabled: UploadRecord.userCommentsEnabled,
          downloadsEnabled: UploadRecord.downloadsEnabled,
        });

      if (!updatedUpload) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
      return { success: true, upload: updatedUpload };
    }),

  createMultipartUpload: channelAdminProcedure
    .input(
      multipartUploadSchema.and(
        z.object({
          postProcess: z.enum([
            'media',
            'thumbnail',
            'channelAvatar',
            'channelDefaultThumbnail',
            'channelCover',
          ]),
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

  getOriginalDownloadUrl: channelProcedure
    .input(
      z.object({
        uploadId: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch upload, scoped to the channel to prevent cross-channel access
      const upload = await db.query.UploadRecord.findFirst({
        columns: {
          id: true,
          finalizedUploadKey: true,
          originalFileName: true,
          title: true,
          channelId: true,
        },
        where: (t, { and, eq }) =>
          and(eq(t.id, input.uploadId), eq(t.channelId, input.channelId)),
      });

      if (!upload) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found',
        });
      }

      if (!upload.finalizedUploadKey) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Upload not finalized yet',
        });
      }

      // Check permission
      if (!ctx.canDownload) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to download original files',
        });
      }

      // Generate filename
      const filename =
        upload.originalFileName ||
        `${sanitizeFilename(upload.title || 'media')}.bin`;

      // Generate signed URL using ingest bucket
      const url = await ingestS3.getSignedGetObject(upload.finalizedUploadKey, {
        responseContentDisposition: `attachment; filename="${sanitizeFilename(filename)}"`,
        expiresIn: 3600, // 1 hour
      });

      return { url };
    }),

  // Playlist procedures
  getChannelPlaylists: channelProcedure.query(async ({ ctx, input }) => {
    moduleLogger.info(
      {
        channelId: input.channelId,
        appUserId: ctx.session.appUserId,
      },
      'Fetching channel playlists',
    );

    const playlists = await db.query.UploadList.findMany({
      columns: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
      with: {
        uploads: {
          columns: { uploadListId: true },
        },
      },
      where: (t, { eq }) => eq(t.channelId, input.channelId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    return playlists.map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      type: playlist.type,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      _count: { uploads: playlist.uploads.length },
    }));
  }),

  searchChannelSeries: channelProcedure
    .input(
      z.object({
        channelId: z.string(),
        query: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const series = await db.query.UploadList.findMany({
        columns: {
          id: true,
          title: true,
        },
        with: {
          uploads: {
            columns: { uploadListId: true },
          },
        },
        where: (t, { and, eq, ilike }) =>
          and(
            eq(t.channelId, input.channelId),
            eq(t.type, 'SERIES'),
            ilike(t.title, `%${input.query}%`),
          ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: 10,
      });

      return series.map((s) => ({
        id: s.id,
        title: s.title,
        _count: { uploads: s.uploads.length },
      }));
    }),

  getPlaylistDetails: channelProcedure
    .input(playlistQuerySchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          context: {
            playlistId: input.playlistId,
          },
        },
        'Fetching playlist details',
      );

      const playlist = await db.query.UploadList.findFirst({
        columns: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
        with: {
          uploads: {
            columns: {
              rank: true,
            },
            with: {
              upload: {
                columns: {
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
            },
            orderBy: (t, { asc }) => [asc(t.rank), asc(t.createdAt)],
          },
        },
        where: (t, { and, eq }) =>
          and(eq(t.id, input.playlistId), eq(t.channelId, input.channelId)),
      });

      if (!playlist) {
        moduleLogger.warn(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              playlistId: input.playlistId,
            },
          },
          'Playlist not found',
        );
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
      moduleLogger.info(
        {
          channelId: input.channelId,
          context: {
            playlistTitle: input.title,
            playlistType: input.type,
            createdBy: ctx.session.appUserId,
          },
        },
        'Creating playlist',
      );

      try {
        const [playlist] = await db
          .insert(UploadList)
          .values({
            title: input.title,
            type: input.type,
            authorId: ctx.session.appUser.id,
            channelId: input.channelId,
            updatedAt: new Date(),
          })
          .returning({
            id: UploadList.id,
            title: UploadList.title,
            type: UploadList.type,
            createdAt: UploadList.createdAt,
          });

        moduleLogger.info(
          {
            channelId: input.channelId,
            context: {
              playlistId: playlist?.id,
              playlistTitle: input.title,
              createdBy: ctx.session.appUserId,
            },
          },
          'Playlist created successfully',
        );

        if (!playlist) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }
        return { success: true, playlist };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        moduleLogger.error(
          {
            channelId: input.channelId,
            context: {
              playlistTitle: input.title,
              createdBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to create playlist',
        );
        throw error;
      }
    }),

  updatePlaylist: channelEditProcedure
    .input(updatePlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            playlistId: input.playlistId,
            playlistTitle: input.title,
            playlistType: input.type,
            updatedBy: ctx.session.appUserId,
          },
        },
        'Updating playlist',
      );

      try {
        const [updatedPlaylist] = await db
          .update(UploadList)
          .set({
            title: input.title,
            type: input.type,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(UploadList.id, input.playlistId),
              eq(UploadList.channelId, input.channelId),
            ),
          )
          .returning({
            id: UploadList.id,
            title: UploadList.title,
            type: UploadList.type,
            updatedAt: UploadList.updatedAt,
          });

        moduleLogger.info(
          {
            context: {
              playlistId: input.playlistId,
              playlistTitle: input.title,
              updatedBy: ctx.session.appUserId,
            },
          },
          'Playlist updated successfully',
        );

        if (!updatedPlaylist) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Playlist not found or not owned by channel',
          });
        }
        return { success: true, playlist: updatedPlaylist };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        moduleLogger.error(
          {
            context: {
              playlistId: input.playlistId,
              playlistTitle: input.title,
              updatedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to update playlist',
        );
        throw error;
      }
    }),

  deletePlaylist: channelEditProcedure
    .input(deletePlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            playlistId: input.playlistId,
            deletedBy: ctx.session.appUserId,
          },
        },
        'Deleting playlist',
      );

      try {
        const playlist = await db.query.UploadList.findFirst({
          columns: { id: true },
          where: (t, { and, eq }) =>
            and(eq(t.id, input.playlistId), eq(t.channelId, input.channelId)),
        });

        if (!playlist) {
          moduleLogger.warn(
            {
              context: {
                playlistId: input.playlistId,
                deletedBy: ctx.session.appUserId,
              },
            },
            'Playlist not found',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Playlist not found',
          });
        }

        await db.delete(UploadList).where(
          and(
            eq(UploadList.id, input.playlistId),
            eq(UploadList.channelId, input.channelId),
          ),
        );

        moduleLogger.info(
          {
            context: {
              playlistId: input.playlistId,
              deletedBy: ctx.session.appUserId,
            },
          },
          'Playlist deleted successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              playlistId: input.playlistId,
              deletedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to delete playlist',
        );
        throw error;
      }
    }),

  addToPlaylist: channelEditProcedure
    .input(addToPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          uploadId: input.uploadId,
          context: {
            playlistId: input.playlistId,
            addedBy: ctx.session.appUserId,
          },
        },
        'Adding upload to playlist',
      );

      try {
        // Get the playlist to verify it exists and get its channelId
        const playlist = await db.query.UploadList.findFirst({
          columns: { id: true, channelId: true },
          where: (t, { eq }) => eq(t.id, input.playlistId),
        });

        const playlistChannelId = playlist?.channelId;
        if (!playlistChannelId) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              context: {
                playlistId: input.playlistId,
                addedBy: ctx.session.appUserId,
              },
            },
            'Playlist not found for add to playlist',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Playlist not found',
          });
        }

        // SECURITY: Verify the playlist belongs to the channel the user has permission for
        if (playlistChannelId !== input.channelId) {
          moduleLogger.warn(
            'Playlist does not belong to the requested channel',
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Playlist does not belong to this channel',
          });
        }

        // Verify the upload belongs to the same channel
        const upload = await db.query.UploadRecord.findFirst({
          columns: { id: true },
          where: (t, { and, eq }) =>
            and(eq(t.id, input.uploadId), eq(t.channelId, playlistChannelId)),
        });

        if (!upload) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              channelId: playlistChannelId,
              context: {
                playlistId: input.playlistId,
                addedBy: ctx.session.appUserId,
              },
            },
            'Upload not found or channel mismatch',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found or does not belong to this channel',
          });
        }

        // Check if upload is already in playlist
        const existingEntry = await db.query.UploadListEntry.findFirst({
          where: (t, { and, eq }) =>
            and(
              eq(t.uploadListId, input.playlistId),
              eq(t.uploadRecordId, input.uploadId),
            ),
        });

        if (existingEntry) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              context: {
                playlistId: input.playlistId,
                addedBy: ctx.session.appUserId,
              },
            },
            'Upload already in playlist',
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload is already in this playlist',
          });
        }

        await db.insert(UploadListEntry).values({
          uploadListId: input.playlistId,
          uploadRecordId: input.uploadId,
        });

        moduleLogger.info(
          {
            uploadId: input.uploadId,
            context: {
              playlistId: input.playlistId,
              addedBy: ctx.session.appUserId,
            },
          },
          'Upload added to playlist successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            uploadId: input.uploadId,
            context: {
              playlistId: input.playlistId,
              addedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to add upload to playlist',
        );
        throw error;
      }
    }),

  removeFromPlaylist: channelEditProcedure
    .input(removeFromPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          uploadId: input.uploadId,
          context: {
            playlistId: input.playlistId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing upload from playlist',
      );

      try {
        // SECURITY: Verify the playlist belongs to the channel the user has permission for
        const playlist = await db.query.UploadList.findFirst({
          columns: { channelId: true },
          where: (t, { eq }) => eq(t.id, input.playlistId),
        });

        if (!playlist) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              context: {
                playlistId: input.playlistId,
                removedBy: ctx.session.appUserId,
              },
            },
            'Playlist not found for remove from playlist',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Playlist not found',
          });
        }

        if (playlist.channelId !== input.channelId) {
          moduleLogger.warn(
            'Playlist does not belong to the requested channel',
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Playlist does not belong to this channel',
          });
        }

        const deletedEntries = await db
          .delete(UploadListEntry)
          .where(
            and(
              eq(UploadListEntry.uploadListId, input.playlistId),
              eq(UploadListEntry.uploadRecordId, input.uploadId),
            ),
          )
          .returning({ uploadListId: UploadListEntry.uploadListId });

        if (deletedEntries.length === 0) {
          moduleLogger.warn(
            {
              uploadId: input.uploadId,
              context: {
                playlistId: input.playlistId,
                removedBy: ctx.session.appUserId,
              },
            },
            'Upload not found in playlist for removal',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found in playlist',
          });
        }

        moduleLogger.info(
          {
            uploadId: input.uploadId,
            context: {
              playlistId: input.playlistId,
              removedBy: ctx.session.appUserId,
            },
          },
          'Upload removed from playlist successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            uploadId: input.uploadId,
            context: {
              playlistId: input.playlistId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove upload from playlist',
        );
        throw error;
      }
    }),

  reorderPlaylist: channelEditProcedure
    .input(reorderPlaylistSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            playlistId: input.playlistId,
            uploadCount: input.uploadIds.length,
            reorderedBy: ctx.session.appUserId,
          },
        },
        'Reordering playlist',
      );

      try {
        const playlist = await db.query.UploadList.findFirst({
          columns: { id: true, channelId: true },
          where: (t, { eq }) => eq(t.id, input.playlistId),
        });

        if (!playlist || playlist.channelId !== input.channelId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        await db.transaction(async (tx) => {
          for (let index = 0; index < input.uploadIds.length; index++) {
            const uploadId = input.uploadIds[index];
            if (!uploadId) continue;
            await tx
              .update(UploadListEntry)
              .set({ rank: index })
              .where(
                and(
                  eq(UploadListEntry.uploadListId, input.playlistId),
                  eq(UploadListEntry.uploadRecordId, uploadId),
                ),
              );
          }
        });

        moduleLogger.info(
          {
            context: {
              playlistId: input.playlistId,
              uploadCount: input.uploadIds.length,
              reorderedBy: ctx.session.appUserId,
            },
          },
          'Playlist reordered successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              playlistId: input.playlistId,
              uploadCount: input.uploadIds.length,
              reorderedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to reorder playlist',
        );
        throw error;
      }
    }),

  approveChannel: authProcedure
    .input(channelQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can approve channels
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
            context: {
              role: ctx.session.appUser.role,
            },
          },
          'Non-admin user attempted to approve channel',
        );
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        },
        'Approving channel',
      );

      try {
        await db
          .update(Channel)
          .set({
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
            updatedAt: new Date(),
          })
          .where(eq(Channel.id, input.channelId));

        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
          },
          'Channel approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve channel',
        );

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
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
            context: {
              role: ctx.session.appUser.role,
            },
          },
          'Non-admin user attempted to unapprove channel',
        );
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        },
        'Unapproving channel',
      );

      try {
        await db
          .update(Channel)
          .set({
            approvedAt: null,
            approvedById: null,
            updatedAt: new Date(),
          })
          .where(eq(Channel.id, input.channelId));

        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
          },
          'Channel unapproved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to unapprove channel',
        );

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
        const [channelRecord, userRecord] = await Promise.all([
          db.query.Channel.findFirst({
            columns: { slug: true },
            where: (t, { eq }) => eq(t.id, channelId),
          }),
          db.query.AppUser.findFirst({
            columns: { username: true },
            where: (t, { eq }) => eq(t.id, ctx.session.appUserId),
          }),
        ]);

        if (!channelRecord || !userRecord) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        // Start the import workflow
        await importMedia({
          url,
          username: userRecord.username,
          channelSlug: channelRecord.slug,
          taskQueue: BACKGROUND_QUEUE,
          ...workflowData,
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Import workflow started',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              url: input.url,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start import workflow',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start import',
        });
      }
    }),
});
