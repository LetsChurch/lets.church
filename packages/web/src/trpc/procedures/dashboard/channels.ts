import {
  Channel,
  ChannelInvitation,
  ChannelMembership,
  ChannelSubscription,
  db,
  FeaturedUpload,
  Speaker,
  SpeakerAttribution,
  SpeakerLink,
  SpeakerParagraphLabel,
  SpeakerTagRequest,
  TranscriptParagraph,
  UploadLicense,
  UploadList,
  UploadListEntry,
  UploadRecord,
  UploadUserComment,
  UploadView,
} from '@letschurch/db';
import { suggestSpeakersByEmbedding } from '@letschurch/opensearch';
import { PART_SIZE } from '@letschurch/s3';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { BACKGROUND_QUEUE } from '@letschurch/temporal/queues';
import { staticMeta } from '@letschurch/temporal/util/dashboard-links';
import { emailHtml, sanitizeForHtml } from '@letschurch/temporal/util/email';
import { TRPCError } from '@trpc/server';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { stripIndent } from 'proper-tags';
import sanitizeFilename from 'sanitize-filename';
import { z } from 'zod';

import {
  MAX_BULK_MEDIA_IMPORT_BYTES,
  parseBulkMediaImportCsv,
} from '@/imports/bulk-media-import';
import {
  finalizeMultipartUploadSchema,
  getThumbnailResize,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  addToPlaylistSchema,
  approveSpeakerLinkSchema,
  assignSpeakerLabelsSchema,
  attributeSpeakerSchema,
  bulkSetVisibilitySchema,
  cancelChannelInvitationSchema,
  channelQuerySchema,
  channelUploadsQuerySchema,
  createChannelSchema,
  createPlaylistSchema,
  createSpeakerFromClusterSchema,
  createSpeakerSchema,
  createUploadSchema,
  deletePlaylistSchema,
  deleteSpeakerSchema,
  deleteUploadSchema,
  getSpeakerAppearancesSchema,
  getSpeakerLabelingQueueSchema,
  importMediaSchema,
  inviteChannelMemberSchema,
  playlistQuerySchema,
  removeFromPlaylistSchema,
  removeMemberSchema,
  reorderPlaylistSchema,
  requestSpeakerLinkSchema,
  requestSpeakerTagSchema,
  resendChannelInvitationSchema,
  saveSpeakerLabelingSchema,
  searchSpeakersSchema,
  setParagraphLabelSchema,
  speakerLinkActionSchema,
  suggestSpeakerCandidatesSchema,
  tagRequestActionSchema,
  unattributeSpeakerSchema,
  updateChannelSchema,
  updatePlaylistSchema,
  updateSpeakerSchema,
  updateUploadSchema,
  uploadQuerySchema,
  uploadSpeakerQuerySchema,
} from '@/schemas/dashboard';
import {
  client,
  completeMultipartMediaUpload,
  deleteUpload,
  handleMultipartMediaUpload,
  importMedia,
  makeProcessMediaWorkflowId,
  sendInvitationEmail,
  startBackground,
  startIndexMediaDocument,
  triggerBulkMediaImport,
} from '@/temporal';
import {
  mantineAvatarLg2x,
  mantineAvatarSm2x,
  mantineAvatarXl2x,
} from '@/util/avatar-sizes';
import { coverImageFull, thumbnailMedium } from '@/util/image-sizes';
import logger from '@/util/logger';
import { escapeLikePattern } from '@/util/misc';
import { getPublicImageUrl, getPublicMediaUrl } from '@/util/server-env';
import { slugify } from '@/util/slugify';
import { titleFromFileName } from '@/util/upload-title';
import { uuidTranslator } from '@/util/uuid';

import {
  assertSpeakerUsable,
  assertUploadInChannel,
  authorizedSpeakerChannelIds,
  speakerSlugify,
  uniqueSpeakerSlug,
} from '../../speaker-labeling/helpers';
import {
  applySpeakerAssignments,
  buildLabelingData,
  buildSpeakerAppearances,
  createSpeakerAndAssign,
} from '../../speaker-labeling/queue';
import { authProcedure, participationProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/channel',
});

const MAX_GENERATED_THUMBNAILS = 1000;

function generatedThumbnailPath(uploadId: string, index: number) {
  return `${uploadId}/screenshot_v1_${String(index).padStart(3, '0')}.jpg`;
}

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

export const channelAdminProcedure = channelProcedure.use(
  async ({ ctx, next }) => {
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
  },
);

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

const siteAdminChannelProcedure = channelProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.isSiteAdmin) {
      moduleLogger.warn(
        { appUserId: ctx.session.appUserId },
        'User is not site admin',
      );
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    return next();
  },
);

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

// --- Speaker library helpers ---

// Derive a URL-safe slug from a speaker's name (ascii lowercase, hyphenated).
// Re-index every upload attributed to a speaker (after a name change or delete,
// so the doc-level `speakers` rollup + paragraph speakerName stay current).
async function reindexSpeakerUploads(speakerId: string): Promise<void> {
  const uploads = await db
    .selectDistinct({ uploadRecordId: SpeakerAttribution.uploadRecordId })
    .from(SpeakerAttribution)
    .where(eq(SpeakerAttribution.speakerId, speakerId));
  await Promise.all(
    uploads.map((u) => startIndexMediaDocument(u.uploadRecordId)),
  );
}

// Site admins may act on any channel's links/requests regardless of ownership.
function isSiteAdmin(ctx: { session: { appUser: { role: string } } }): boolean {
  return ctx.session.appUser.role === 'ADMIN';
}

// Load a link by id, verifying its speaker is owned by `channelId` (the side
// that may approve/decline). `allowAny` skips the ownership check (site admins).
// Throws NOT_FOUND otherwise.
async function loadOwnedSpeakerLink(
  channelId: string,
  linkId: string,
  allowAny = false,
): Promise<{ id: string; requestedForUploadId: string | null }> {
  const [link] = await db
    .select({
      id: SpeakerLink.id,
      requestedForUploadId: SpeakerLink.requestedForUploadId,
    })
    .from(SpeakerLink)
    .innerJoin(Speaker, eq(SpeakerLink.speakerId, Speaker.id))
    .where(
      allowAny
        ? eq(SpeakerLink.id, linkId)
        : and(eq(SpeakerLink.id, linkId), eq(Speaker.channelId, channelId)),
    );
  if (!link) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
  }
  return link;
}

export const channelRouter = router({
  createChannel: participationProcedure
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
        const slug = input.slug || slugify(input.name);

        const channel = await db.transaction(async (tx) => {
          const [newChannel] = await tx
            .insert(Channel)
            .values({
              name: input.name,
              slug,
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

          await startBackground('sendEmailWorkflow', {
            ...staticMeta({ summary: 'Channel approval request email' }),
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

    const effectiveLabel = sql<
      string | null
    >`coalesce(${SpeakerParagraphLabel.label}, ${TranscriptParagraph.speaker})`;

    const [
      viewCountResult,
      subscriberCountResult,
      uploadCountResult,
      speakerCountResult,
      unlabeledCountResult,
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(UploadView)
        .innerJoin(UploadRecord, eq(UploadView.uploadRecordId, UploadRecord.id))
        .where(eq(UploadRecord.channelId, input.channelId))
        .then((r) => r[0]),
      db
        .select({ count: count() })
        .from(ChannelSubscription)
        .where(eq(ChannelSubscription.channelId, input.channelId))
        .then((r) => r[0]),
      db
        .select({ count: count() })
        .from(UploadRecord)
        .where(
          and(
            eq(UploadRecord.channelId, input.channelId),
            isNull(UploadRecord.deletedAt),
          ),
        )
        .then((r) => r[0]),
      db
        .select({ count: count() })
        .from(Speaker)
        .where(
          and(
            eq(Speaker.channelId, input.channelId),
            isNull(Speaker.deletedAt),
          ),
        )
        .then((r) => r[0]),
      // Unlabeled "voices": distinct (upload, effective-label) pairs with no
      // attribution, across this channel's transcribed uploads. Cheap count for
      // the dashboard card — no embedding/voice-matching.
      db
        .select({
          count: sql<number>`count(distinct ((${TranscriptParagraph.uploadRecordId})::text || ':' || ${effectiveLabel}))`,
        })
        .from(TranscriptParagraph)
        .innerJoin(
          UploadRecord,
          eq(UploadRecord.id, TranscriptParagraph.uploadRecordId),
        )
        .leftJoin(
          SpeakerParagraphLabel,
          eq(SpeakerParagraphLabel.paragraphId, TranscriptParagraph.id),
        )
        .leftJoin(
          SpeakerAttribution,
          and(
            eq(
              SpeakerAttribution.uploadRecordId,
              TranscriptParagraph.uploadRecordId,
            ),
            eq(SpeakerAttribution.speakerLabel, effectiveLabel),
          ),
        )
        .where(
          and(
            eq(UploadRecord.channelId, input.channelId),
            isNotNull(UploadRecord.transcribingFinishedAt),
            isNull(UploadRecord.deletedAt),
            isNull(SpeakerAttribution.speakerId),
            isNotNull(effectiveLabel),
          ),
        )
        .then((r) => r[0]),
    ]);

    const totalViews = Number(viewCountResult?.count ?? 0);
    const uploadRecordCount = Number(uploadCountResult?.count ?? 0);
    const subscriberCount = Number(subscriberCountResult?.count ?? 0);
    const membershipCount = channel.memberships.length;
    const speakerCount = Number(speakerCountResult?.count ?? 0);
    const unlabeledVoiceCount = Number(unlabeledCountResult?.count ?? 0);

    const { avatarPath, ...channelWithoutPath } = channel;
    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarXl2x,
        })
      : null;

    // Member email addresses are admin-only. Ordinary members (canUpload/
    // canDownload-only) can call this endpoint too, so strip co-members' emails
    // unless the caller is a channel/site admin (parity with getChannelMembers).
    const memberships = ctx.canAdmin
      ? channelWithoutPath.memberships
      : channelWithoutPath.memberships.map((m) => ({
          ...m,
          appUser: { ...m.appUser, emails: [] },
        }));

    return {
      ...channelWithoutPath,
      memberships,
      _count: {
        uploadRecords: uploadRecordCount,
        subscribers: subscriberCount,
        memberships: membershipCount,
        speakers: speakerCount,
        unlabeledVoices: unlabeledVoiceCount,
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

  // --- Speaker library ---

  // Transcript grouped (client-side) by effective speaker label, with the
  // current label→speaker attributions, for the labeling modal.
  getUploadTranscriptForLabeling: channelEditProcedure
    .input(uploadSpeakerQuerySchema)
    .query(async ({ input }) => {
      await assertUploadInChannel(input.channelId, input.uploadId);

      const paragraphs = await db
        .select({
          id: TranscriptParagraph.id,
          order: TranscriptParagraph.order,
          start: TranscriptParagraph.start,
          end: TranscriptParagraph.end,
          speaker: TranscriptParagraph.speaker,
          text: TranscriptParagraph.text,
        })
        .from(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, input.uploadId))
        .orderBy(asc(TranscriptParagraph.order));

      const overrides = await db
        .select({
          paragraphId: SpeakerParagraphLabel.paragraphId,
          label: SpeakerParagraphLabel.label,
        })
        .from(SpeakerParagraphLabel)
        .innerJoin(
          TranscriptParagraph,
          eq(SpeakerParagraphLabel.paragraphId, TranscriptParagraph.id),
        )
        .where(eq(TranscriptParagraph.uploadRecordId, input.uploadId));
      const overrideByParagraphId = new Map(
        overrides.map((o) => [o.paragraphId, o.label]),
      );

      // Current attributions (effective label → speaker), excluding
      // soft-deleted speakers so they read as unlabeled.
      const attributions = await db
        .select({
          label: SpeakerAttribution.speakerLabel,
          speakerId: SpeakerAttribution.speakerId,
          speakerName: Speaker.name,
        })
        .from(SpeakerAttribution)
        .innerJoin(Speaker, eq(SpeakerAttribution.speakerId, Speaker.id))
        .where(
          and(
            eq(SpeakerAttribution.uploadRecordId, input.uploadId),
            isNull(Speaker.deletedAt),
          ),
        );

      return {
        paragraphs: paragraphs.map((p) => ({
          id: p.id,
          order: p.order,
          start: p.start,
          end: p.end,
          speaker: p.speaker,
          effectiveLabel: overrideByParagraphId.get(p.id) ?? p.speaker,
          text: p.text,
        })),
        attributions,
      };
    }),

  // Reassign a single paragraph to a different/new effective label. Setting it
  // back to the diarization label clears the override.
  setParagraphLabel: channelEditProcedure
    .input(setParagraphLabelSchema)
    .mutation(async ({ ctx, input }) => {
      await assertUploadInChannel(input.channelId, input.uploadId);

      const paragraph = await db.query.TranscriptParagraph.findFirst({
        columns: { id: true, speaker: true },
        where: (t, { and, eq }) =>
          and(
            eq(t.id, input.paragraphId),
            eq(t.uploadRecordId, input.uploadId),
          ),
      });
      if (!paragraph) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Paragraph not found',
        });
      }

      if (input.label === paragraph.speaker) {
        // Reverting to the diarization label — drop any override.
        await db
          .delete(SpeakerParagraphLabel)
          .where(eq(SpeakerParagraphLabel.paragraphId, input.paragraphId));
      } else {
        await db
          .insert(SpeakerParagraphLabel)
          .values({
            paragraphId: input.paragraphId,
            label: input.label,
            createdById: ctx.session.appUserId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [SpeakerParagraphLabel.paragraphId],
            set: { label: input.label, updatedAt: new Date() },
          });
      }

      await startIndexMediaDocument(input.uploadId);
      return { success: true };
    }),

  // Attribute an effective label (every paragraph carrying it) to a speaker.
  attributeSpeaker: channelEditProcedure
    .input(attributeSpeakerSchema)
    .mutation(async ({ ctx, input }) => {
      await assertUploadInChannel(input.channelId, input.uploadId);
      await assertSpeakerUsable(
        input.channelId,
        input.speakerId,
        input.uploadId,
      );

      await db
        .insert(SpeakerAttribution)
        .values({
          uploadRecordId: input.uploadId,
          speakerLabel: input.speakerLabel,
          speakerId: input.speakerId,
          createdById: ctx.session.appUserId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            SpeakerAttribution.uploadRecordId,
            SpeakerAttribution.speakerLabel,
          ],
          set: { speakerId: input.speakerId, updatedAt: new Date() },
        });

      await startIndexMediaDocument(input.uploadId);
      return { success: true };
    }),

  unattributeSpeaker: channelEditProcedure
    .input(unattributeSpeakerSchema)
    .mutation(async ({ input }) => {
      await assertUploadInChannel(input.channelId, input.uploadId);
      await db
        .delete(SpeakerAttribution)
        .where(
          and(
            eq(SpeakerAttribution.uploadRecordId, input.uploadId),
            eq(SpeakerAttribution.speakerLabel, input.speakerLabel),
          ),
        );
      await startIndexMediaDocument(input.uploadId);
      return { success: true };
    }),

  // Commit a whole labeling session at once: paragraph-label overrides +
  // label→speaker attributions in a single transaction, then ONE reindex. The
  // modal stages every edit locally and calls this on Save so a session reindexes
  // once instead of per click. A null speakerId unassigns that label.
  saveSpeakerLabeling: channelEditProcedure
    .input(saveSpeakerLabelingSchema)
    .mutation(async ({ ctx, input }) => {
      await assertUploadInChannel(input.channelId, input.uploadId);

      // Validate every referenced paragraph belongs to the upload and capture
      // its diarization label (so reverting an override deletes the row).
      const paragraphs = await db
        .select({
          id: TranscriptParagraph.id,
          speaker: TranscriptParagraph.speaker,
        })
        .from(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, input.uploadId));
      const diarizationById = new Map(paragraphs.map((p) => [p.id, p.speaker]));
      for (const { paragraphId } of input.paragraphLabels) {
        if (!diarizationById.has(paragraphId)) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Paragraph not found',
          });
        }
      }

      // Authorize every assignment up front so a bad one fails the whole save.
      for (const a of input.attributions) {
        if (a.speakerId) {
          await assertSpeakerUsable(
            input.channelId,
            a.speakerId,
            input.uploadId,
          );
        }
      }

      const now = new Date();
      await db.transaction(async (tx) => {
        for (const { paragraphId, label } of input.paragraphLabels) {
          if (label === diarizationById.get(paragraphId)) {
            await tx
              .delete(SpeakerParagraphLabel)
              .where(eq(SpeakerParagraphLabel.paragraphId, paragraphId));
          } else {
            await tx
              .insert(SpeakerParagraphLabel)
              .values({
                paragraphId,
                label,
                createdById: ctx.session.appUserId,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: [SpeakerParagraphLabel.paragraphId],
                set: { label, updatedAt: now },
              });
          }
        }
        for (const { speakerLabel, speakerId } of input.attributions) {
          if (speakerId === null) {
            await tx
              .delete(SpeakerAttribution)
              .where(
                and(
                  eq(SpeakerAttribution.uploadRecordId, input.uploadId),
                  eq(SpeakerAttribution.speakerLabel, speakerLabel),
                ),
              );
          } else {
            await tx
              .insert(SpeakerAttribution)
              .values({
                uploadRecordId: input.uploadId,
                speakerLabel,
                speakerId,
                createdById: ctx.session.appUserId,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: [
                  SpeakerAttribution.uploadRecordId,
                  SpeakerAttribution.speakerLabel,
                ],
                set: { speakerId, updatedAt: now },
              });
          }
        }
      });

      await startIndexMediaDocument(input.uploadId);
      return { success: true };
    }),

  // Labeling data for this channel: (1) `queue` — unlabeled segments matching an
  // existing named speaker; (2) `clusters` — leftover unmatched segments grouped
  // by mutual voice similarity, to name a recurring unknown voice once.
  getSpeakerLabelingQueue: channelAdminProcedure
    .input(getSpeakerLabelingQueueSchema)
    .query(async ({ input }) => {
      return buildLabelingData({
        owningChannelIds: [input.channelId],
        minMatchPercent: input.minMatchPercent,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  // Create a new speaker in this channel and attribute a cluster's members to it.
  createSpeakerFromCluster: channelEditProcedure
    .input(createSpeakerFromClusterSchema)
    .mutation(async ({ ctx, input }) => {
      return createSpeakerAndAssign({
        channelId: input.channelId,
        name: input.name,
        members: input.members,
        actingUserId: ctx.session.appUserId,
        authorizeChannel: (channelId) => channelId === input.channelId,
      });
    }),

  // Bulk-apply attributions from the queue. Every upload must belong to this
  // channel; each speaker must be owned-or-linked. Reindexes touched uploads.
  assignSpeakerLabels: channelEditProcedure
    .input(assignSpeakerLabelsSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await applySpeakerAssignments(input.assignments, {
        actingUserId: ctx.session.appUserId,
        authorizeChannel: (channelId) => channelId === input.channelId,
      });
      return result;
    }),

  // Ranked candidate identities for an unlabeled effective label, by voice
  // similarity (titanet kNN, then bucket-by-identity). Falls back to the
  // channel's most-used speakers when the embedding pool is cold.
  suggestSpeakerCandidates: channelEditProcedure
    .input(suggestSpeakerCandidatesSchema)
    .query(async ({ input }) => {
      await assertUploadInChannel(input.channelId, input.uploadId);

      // Average the 192-dim titanet vectors of the paragraphs carrying this
      // effective label (override ?? diarization speaker).
      const rows = await db
        .select({
          id: TranscriptParagraph.id,
          speaker: TranscriptParagraph.speaker,
          speakerEmbedding: TranscriptParagraph.speakerEmbedding,
          overrideLabel: SpeakerParagraphLabel.label,
        })
        .from(TranscriptParagraph)
        .leftJoin(
          SpeakerParagraphLabel,
          eq(SpeakerParagraphLabel.paragraphId, TranscriptParagraph.id),
        )
        .where(eq(TranscriptParagraph.uploadRecordId, input.uploadId));

      const vectors = rows
        .filter((r) => (r.overrideLabel ?? r.speaker) === input.speakerLabel)
        .map((r) => r.speakerEmbedding)
        .filter((v): v is number[] => Array.isArray(v) && v.length > 0);

      const channelIds = await authorizedSpeakerChannelIds(input.channelId);

      let candidates: Array<{
        speakerId: string;
        name: string;
        channelId: string;
        channelName: string;
        // Voice-match confidence (0–100) from the titanet kNN; null for the
        // cold-start fallback (no embedding comparison).
        matchPercent: number | null;
      }> = [];

      if (vectors.length > 0) {
        const dims = vectors[0]?.length ?? 0;
        const avg = new Array<number>(dims).fill(0);
        for (const v of vectors) {
          for (let i = 0; i < dims; i++) avg[i] += (v[i] ?? 0) / vectors.length;
        }

        const knn = await suggestSpeakersByEmbedding({
          speakerEmbedding: avg,
          channelIds,
        });

        if (knn.length > 0) {
          // Resolve fresh names + ownership from the DB; drop ids that no
          // longer resolve to a usable (non-deleted, authorized) speaker.
          const ids = knn.map((c) => c.speakerId);
          const speakers = await db
            .select({
              id: Speaker.id,
              name: Speaker.name,
              channelId: Speaker.channelId,
              channelName: Channel.name,
            })
            .from(Speaker)
            .innerJoin(Channel, eq(Speaker.channelId, Channel.id))
            .where(
              and(
                inArray(Speaker.id, ids),
                inArray(Speaker.channelId, channelIds),
                isNull(Speaker.deletedAt),
              ),
            );
          const byId = new Map(speakers.map((s) => [s.id, s]));
          candidates = knn
            .map((c) => {
              const s = byId.get(c.speakerId);
              if (!s) return null;
              // faiss cosinesimil knn returns score = (1 + cosine) / 2, so
              // cosine = 2*score - 1; surface it as a 0–100 match confidence.
              const cosine = 2 * c.topScore - 1;
              const matchPercent = Math.max(
                0,
                Math.min(100, Math.round(cosine * 100)),
              );
              return {
                speakerId: s.id,
                name: s.name,
                channelId: s.channelId,
                channelName: s.channelName,
                matchPercent,
              };
            })
            .filter((c): c is NonNullable<typeof c> => c != null);
        }
      }

      // Only high-confidence voice matches are returned (the kNN floor handles
      // this). When none qualify, there are simply no suggestions — the picker
      // still lists the channel's speakers under "This channel" to choose from.
      return { candidates };
    }),

  // Speakers owned by the channel, with attribution counts.
  getChannelSpeakers: channelProcedure.query(async ({ ctx, input }) => {
    const speakers = await db
      .select({
        id: Speaker.id,
        name: Speaker.name,
        slug: Speaker.slug,
        bio: Speaker.bio,
        createdAt: Speaker.createdAt,
        attributionCount: count(SpeakerAttribution.id),
      })
      .from(Speaker)
      .leftJoin(
        SpeakerAttribution,
        eq(SpeakerAttribution.speakerId, Speaker.id),
      )
      .where(
        and(eq(Speaker.channelId, input.channelId), isNull(Speaker.deletedAt)),
      )
      .groupBy(Speaker.id)
      .orderBy(asc(Speaker.name));

    return { speakers, canAdmin: ctx.canAdmin };
  }),

  createSpeaker: channelEditProcedure
    .input(createSpeakerSchema)
    .mutation(async ({ ctx, input }) => {
      const base = speakerSlugify(input.slug ?? input.name);
      const slug = await uniqueSpeakerSlug(input.channelId, base);

      const [speaker] = await db
        .insert(Speaker)
        .values({
          channelId: input.channelId,
          name: input.name,
          slug,
          bio: input.bio ?? null,
          createdById: ctx.session.appUserId,
          updatedAt: new Date(),
        })
        .returning({
          id: Speaker.id,
          name: Speaker.name,
          slug: Speaker.slug,
          bio: Speaker.bio,
        });

      if (!speaker) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }
      return { speaker };
    }),

  updateSpeaker: channelAdminProcedure
    .input(updateSpeakerSchema)
    .mutation(async ({ input }) => {
      const [speaker] = await db
        .update(Speaker)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(Speaker.id, input.speakerId),
            eq(Speaker.channelId, input.channelId),
            isNull(Speaker.deletedAt),
          ),
        )
        .returning({ id: Speaker.id });

      if (!speaker) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Speaker not found',
        });
      }

      // The name feeds the doc-level `speakers` rollup, so re-index every upload
      // attributed to this speaker.
      if (input.name !== undefined) {
        await reindexSpeakerUploads(input.speakerId);
      }
      return { success: true };
    }),

  deleteSpeaker: channelAdminProcedure
    .input(deleteSpeakerSchema)
    .mutation(async ({ input }) => {
      const [speaker] = await db
        .update(Speaker)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(Speaker.id, input.speakerId),
            eq(Speaker.channelId, input.channelId),
            isNull(Speaker.deletedAt),
          ),
        )
        .returning({ id: Speaker.id });

      if (!speaker) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Speaker not found',
        });
      }

      // Attributions are kept; re-index drops the now-deleted name from search.
      await reindexSpeakerUploads(input.speakerId);
      return { success: true };
    }),

  // Search speakers owned by OTHER channels (to request a cross-channel link).
  searchSpeakers: channelProcedure
    .input(searchSpeakersSchema)
    .query(async ({ input }) => {
      const results = await db
        .select({
          speakerId: Speaker.id,
          name: Speaker.name,
          channelId: Speaker.channelId,
          channelName: Channel.name,
          linkStatus: SpeakerLink.status,
        })
        .from(Speaker)
        .innerJoin(Channel, eq(Speaker.channelId, Channel.id))
        .leftJoin(
          SpeakerLink,
          and(
            eq(SpeakerLink.speakerId, Speaker.id),
            eq(SpeakerLink.requestingChannelId, input.channelId),
          ),
        )
        .where(
          and(
            ne(Speaker.channelId, input.channelId),
            isNull(Speaker.deletedAt),
            ilike(Speaker.name, `%${escapeLikePattern(input.query)}%`),
          ),
        )
        .orderBy(asc(Speaker.name))
        .limit(20);

      return { results };
    }),

  requestSpeakerLink: channelAdminProcedure
    .input(requestSpeakerLinkSchema)
    .mutation(async ({ ctx, input }) => {
      const speaker = await db.query.Speaker.findFirst({
        columns: { id: true, channelId: true },
        where: (t, { and, eq, isNull }) =>
          and(eq(t.id, input.speakerId), isNull(t.deletedAt)),
      });
      if (!speaker) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Speaker not found',
        });
      }
      if (speaker.channelId === input.channelId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You already own this speaker',
        });
      }
      if (input.forUploadId) {
        await assertUploadInChannel(input.channelId, input.forUploadId);
      }

      await db
        .insert(SpeakerLink)
        .values({
          speakerId: input.speakerId,
          requestingChannelId: input.channelId,
          status: 'PENDING',
          requestedForUploadId: input.forUploadId ?? null,
          requestedById: ctx.session.appUserId,
        })
        .onConflictDoUpdate({
          target: [SpeakerLink.speakerId, SpeakerLink.requestingChannelId],
          set: {
            status: 'PENDING',
            requestedForUploadId: input.forUploadId ?? null,
            requestedById: ctx.session.appUserId,
            respondedById: null,
            respondedAt: null,
            grantedUploadId: null,
          },
        });

      return { success: true };
    }),

  // Pending requests from other channels to use THIS channel's speakers.
  getIncomingSpeakerLinkRequests: channelAdminProcedure
    .input(channelQuerySchema)
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: SpeakerLink.id,
          createdAt: SpeakerLink.createdAt,
          speakerId: Speaker.id,
          speakerName: Speaker.name,
          requestingChannelName: Channel.name,
          requestedForUploadId: SpeakerLink.requestedForUploadId,
        })
        .from(SpeakerLink)
        .innerJoin(Speaker, eq(SpeakerLink.speakerId, Speaker.id))
        .innerJoin(Channel, eq(SpeakerLink.requestingChannelId, Channel.id))
        .where(
          and(
            eq(Speaker.channelId, input.channelId),
            eq(SpeakerLink.status, 'PENDING'),
          ),
        )
        .orderBy(desc(SpeakerLink.createdAt));

      return rows.map((r) => ({
        ...r,
        requestedForUploadId: r.requestedForUploadId
          ? uuidTranslator.fromUUID(r.requestedForUploadId)
          : null,
      }));
    }),

  // This channel's outgoing link requests to other channels' speakers.
  getOutgoingSpeakerLinkRequests: channelProcedure.query(async ({ input }) => {
    const rows = await db
      .select({
        id: SpeakerLink.id,
        status: SpeakerLink.status,
        createdAt: SpeakerLink.createdAt,
        respondedAt: SpeakerLink.respondedAt,
        speakerName: Speaker.name,
        ownerChannelName: Channel.name,
        grantedUploadId: SpeakerLink.grantedUploadId,
      })
      .from(SpeakerLink)
      .innerJoin(Speaker, eq(SpeakerLink.speakerId, Speaker.id))
      .innerJoin(Channel, eq(Speaker.channelId, Channel.id))
      .where(eq(SpeakerLink.requestingChannelId, input.channelId))
      .orderBy(desc(SpeakerLink.createdAt));

    return rows.map((r) => ({
      ...r,
      grantedUploadId: r.grantedUploadId
        ? uuidTranslator.fromUUID(r.grantedUploadId)
        : null,
    }));
  }),

  approveSpeakerLink: channelAdminProcedure
    .input(approveSpeakerLinkSchema)
    .mutation(async ({ ctx, input }) => {
      const link = await loadOwnedSpeakerLink(
        input.channelId,
        input.linkId,
        isSiteAdmin(ctx),
      );

      if (input.scope === 'upload' && !link.requestedForUploadId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This request has no specific upload to grant',
        });
      }

      await db
        .update(SpeakerLink)
        .set({
          status: 'ACCEPTED',
          respondedById: ctx.session.appUserId,
          respondedAt: new Date(),
          grantedUploadId:
            input.scope === 'upload' ? link.requestedForUploadId : null,
        })
        .where(eq(SpeakerLink.id, link.id));

      return { success: true };
    }),

  declineSpeakerLink: channelAdminProcedure
    .input(speakerLinkActionSchema)
    .mutation(async ({ ctx, input }) => {
      const link = await loadOwnedSpeakerLink(
        input.channelId,
        input.linkId,
        isSiteAdmin(ctx),
      );
      await db
        .update(SpeakerLink)
        .set({
          status: 'DECLINED',
          respondedById: ctx.session.appUserId,
          respondedAt: new Date(),
        })
        .where(eq(SpeakerLink.id, link.id));
      return { success: true };
    }),

  // Requesting side cancels its own pending request.
  cancelSpeakerLinkRequest: channelAdminProcedure
    .input(speakerLinkActionSchema)
    .mutation(async ({ input }) => {
      const result = await db
        .update(SpeakerLink)
        .set({ status: 'CANCELLED' })
        .where(
          and(
            eq(SpeakerLink.id, input.linkId),
            eq(SpeakerLink.requestingChannelId, input.channelId),
          ),
        )
        .returning({ id: SpeakerLink.id });
      if (result.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Request not found',
        });
      }
      return { success: true };
    }),

  // Untagged appearances of this channel's speakers on OTHER channels' uploads
  // (voice matches), each flagged if a tag request is already pending.
  getSpeakerAppearances: channelAdminProcedure
    .input(getSpeakerAppearancesSchema)
    .query(async ({ input }) => {
      const { appearances, total, hasMore } = await buildSpeakerAppearances({
        channelId: input.channelId,
        limit: input.limit,
        offset: input.offset,
      });
      const pending = await db
        .select({
          speakerId: SpeakerTagRequest.speakerId,
          uploadRecordId: SpeakerTagRequest.uploadRecordId,
          speakerLabel: SpeakerTagRequest.speakerLabel,
        })
        .from(SpeakerTagRequest)
        .innerJoin(Speaker, eq(Speaker.id, SpeakerTagRequest.speakerId))
        .where(
          and(
            eq(Speaker.channelId, input.channelId),
            eq(SpeakerTagRequest.status, 'PENDING'),
          ),
        );
      const pendingKeys = new Set(
        pending.map(
          (p) => `${p.speakerId}:${p.uploadRecordId}:${p.speakerLabel}`,
        ),
      );
      return {
        appearances: appearances.map((a) => ({
          ...a,
          requested: pendingKeys.has(
            `${a.speakerId}:${a.uploadId}:${a.speakerLabel}`,
          ),
        })),
        total,
        hasMore,
      };
    }),

  // Owner asks the content channel to tag its speaker on that upload.
  requestSpeakerTag: channelAdminProcedure
    .input(requestSpeakerTagSchema)
    .mutation(async ({ ctx, input }) => {
      const speaker = await db.query.Speaker.findFirst({
        columns: { id: true },
        where: (t, { and, eq, isNull }) =>
          and(
            eq(t.id, input.speakerId),
            eq(t.channelId, input.channelId),
            isNull(t.deletedAt),
          ),
      });
      if (!speaker) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Speaker not found',
        });
      }
      const upload = await db.query.UploadRecord.findFirst({
        columns: { id: true, channelId: true },
        where: (t, { eq }) => eq(t.id, input.uploadId),
      });
      if (!upload) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
      }
      if (upload.channelId === input.channelId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That upload is on your own channel',
        });
      }
      await db
        .insert(SpeakerTagRequest)
        .values({
          speakerId: input.speakerId,
          uploadRecordId: input.uploadId,
          speakerLabel: input.speakerLabel,
          requestedById: ctx.session.appUserId,
        })
        .onConflictDoUpdate({
          target: [
            SpeakerTagRequest.speakerId,
            SpeakerTagRequest.uploadRecordId,
            SpeakerTagRequest.speakerLabel,
          ],
          // Re-open a previously declined/cancelled request.
          set: {
            status: 'PENDING',
            requestedById: ctx.session.appUserId,
            respondedById: null,
            respondedAt: null,
          },
        });
      return { success: true };
    }),

  // The content channel's inbox: pending requests to tag a speaker on ITS
  // uploads. Owner channel = the speaker's channel.
  getIncomingTagRequests: channelAdminProcedure.query(async ({ input }) => {
    const rows = await db
      .select({
        id: SpeakerTagRequest.id,
        createdAt: SpeakerTagRequest.createdAt,
        speakerName: Speaker.name,
        ownerChannelName: Channel.name,
        uploadId: UploadRecord.id,
        uploadTitle: UploadRecord.title,
        speakerLabel: SpeakerTagRequest.speakerLabel,
      })
      .from(SpeakerTagRequest)
      .innerJoin(Speaker, eq(Speaker.id, SpeakerTagRequest.speakerId))
      .innerJoin(Channel, eq(Channel.id, Speaker.channelId))
      .innerJoin(
        UploadRecord,
        eq(UploadRecord.id, SpeakerTagRequest.uploadRecordId),
      )
      .where(
        and(
          eq(UploadRecord.channelId, input.channelId),
          eq(SpeakerTagRequest.status, 'PENDING'),
        ),
      )
      .orderBy(desc(SpeakerTagRequest.createdAt));
    return rows.map((r) => ({
      ...r,
      uploadId: uuidTranslator.fromUUID(r.uploadId),
    }));
  }),

  // Content channel (or a site admin) approves → tag the speaker on the upload.
  // Approval IS the cross-channel consent, so we attribute directly.
  approveTagRequest: channelAdminProcedure
    .input(tagRequestActionSchema)
    .mutation(async ({ ctx, input }) => {
      const [req] = await db
        .select({
          id: SpeakerTagRequest.id,
          speakerId: SpeakerTagRequest.speakerId,
          uploadRecordId: SpeakerTagRequest.uploadRecordId,
          speakerLabel: SpeakerTagRequest.speakerLabel,
          uploadChannelId: UploadRecord.channelId,
        })
        .from(SpeakerTagRequest)
        .innerJoin(
          UploadRecord,
          eq(UploadRecord.id, SpeakerTagRequest.uploadRecordId),
        )
        .where(eq(SpeakerTagRequest.id, input.requestId));
      if (!req) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Request not found',
        });
      }
      if (!isSiteAdmin(ctx) && req.uploadChannelId !== input.channelId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(SpeakerTagRequest)
          .set({
            status: 'ACCEPTED',
            respondedById: ctx.session.appUserId,
            respondedAt: now,
          })
          .where(eq(SpeakerTagRequest.id, req.id));
        await tx
          .insert(SpeakerAttribution)
          .values({
            uploadRecordId: req.uploadRecordId,
            speakerLabel: req.speakerLabel,
            speakerId: req.speakerId,
            createdById: ctx.session.appUserId,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              SpeakerAttribution.uploadRecordId,
              SpeakerAttribution.speakerLabel,
            ],
            set: { speakerId: req.speakerId, updatedAt: now },
          });
      });
      await startIndexMediaDocument(req.uploadRecordId);
      return { success: true };
    }),

  declineTagRequest: channelAdminProcedure
    .input(tagRequestActionSchema)
    .mutation(async ({ ctx, input }) => {
      const [req] = await db
        .select({
          id: SpeakerTagRequest.id,
          uploadChannelId: UploadRecord.channelId,
        })
        .from(SpeakerTagRequest)
        .innerJoin(
          UploadRecord,
          eq(UploadRecord.id, SpeakerTagRequest.uploadRecordId),
        )
        .where(eq(SpeakerTagRequest.id, input.requestId));
      if (!req) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Request not found',
        });
      }
      if (!isSiteAdmin(ctx) && req.uploadChannelId !== input.channelId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      await db
        .update(SpeakerTagRequest)
        .set({
          status: 'DECLINED',
          respondedById: ctx.session.appUserId,
          respondedAt: new Date(),
        })
        .where(eq(SpeakerTagRequest.id, req.id));
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
      const escapedSearch = input.search
        ? escapeLikePattern(input.search)
        : undefined;

      const viewCountSq = db
        .select({
          uploadRecordId: UploadView.uploadRecordId,
          cnt: count().as('view_cnt'),
        })
        .from(UploadView)
        .groupBy(UploadView.uploadRecordId)
        .as('view_counts');

      const commentCountSq = db
        .select({
          uploadRecordId: UploadUserComment.uploadRecordId,
          cnt: count().as('comment_cnt'),
        })
        .from(UploadUserComment)
        .groupBy(UploadUserComment.uploadRecordId)
        .as('comment_counts');

      const uploadsWhere = and(
        eq(UploadRecord.channelId, input.channelId),
        ...(input.search
          ? [ilike(UploadRecord.title, `%${escapedSearch}%`)]
          : []),
        or(
          eq(UploadRecord.visibility, 'PUBLIC'),
          eq(UploadRecord.visibility, 'UNLISTED'),
          eq(UploadRecord.visibility, 'PRIVATE'),
        ),
      );

      const uploadSortColumn =
        input.sort === 'title'
          ? UploadRecord.title
          : input.sort === 'visibility'
            ? sql<string>`${UploadRecord.visibility}::text`
            : input.sort === 'views'
              ? sql<number>`coalesce(${viewCountSq.cnt}, 0)`
              : UploadRecord.createdAt;
      const uploadSortDirection = input.direction === 'asc' ? asc : desc;

      const [uploads, totalCountResult] = await Promise.all([
        db
          .select({
            id: UploadRecord.id,
            title: UploadRecord.title,
            description: UploadRecord.description,
            visibility: UploadRecord.visibility,
            createdAt: UploadRecord.createdAt,
            lengthSeconds: UploadRecord.lengthSeconds,
            finalizedUploadKey: UploadRecord.finalizedUploadKey,
            defaultThumbnailPath: UploadRecord.defaultThumbnailPath,
            overrideThumbnailPath: UploadRecord.overrideThumbnailPath,
            isFeatured: isNotNull(FeaturedUpload.uploadRecordId).mapWith(
              Boolean,
            ),
            viewCount: sql<number>`coalesce(${viewCountSq.cnt}, 0)::int`,
            commentCount: sql<number>`coalesce(${commentCountSq.cnt}, 0)::int`,
          })
          .from(UploadRecord)
          .leftJoin(
            FeaturedUpload,
            eq(UploadRecord.id, FeaturedUpload.uploadRecordId),
          )
          .leftJoin(
            viewCountSq,
            eq(UploadRecord.id, viewCountSq.uploadRecordId),
          )
          .leftJoin(
            commentCountSq,
            eq(UploadRecord.id, commentCountSq.uploadRecordId),
          )
          .where(uploadsWhere)
          .orderBy(uploadSortDirection(uploadSortColumn), desc(UploadRecord.id))
          .offset(offset)
          .limit(input.limit),
        db
          .select({ count: count() })
          .from(UploadRecord)
          .where(
            and(
              eq(UploadRecord.channelId, input.channelId),
              ...(input.search
                ? [ilike(UploadRecord.title, `%${escapedSearch}%`)]
                : []),
            ),
          )
          .then((r) => r[0]?.count),
      ]);

      const totalCount = Number(totalCountResult ?? 0);
      const totalPages = Math.ceil(totalCount / input.limit);

      const uploadsWithThumbnails = uploads.map((upload) => {
        const thumbnailPath =
          upload.overrideThumbnailPath ?? upload.defaultThumbnailPath;
        const thumbnailUrl = thumbnailPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(thumbnailPath),
              getThumbnailResize('table'),
            )
          : null;

        return {
          id: upload.id,
          title: upload.title,
          description: upload.description,
          visibility: upload.visibility,
          createdAt: upload.createdAt,
          lengthSeconds: upload.lengthSeconds,
          finalizedUploadKey: upload.finalizedUploadKey,
          thumbnailUrl,
          isFeatured: upload.isFeatured,
          _count: {
            uploadViews: upload.viewCount,
            userComments: upload.commentCount,
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
          // Pre-fill the title from the file name so the new upload's edit page
          // opens with a sensible default the user can accept or tweak.
          title: input.originalFileName
            ? titleFromFileName(input.originalFileName) || null
            : null,
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
          thumbnailCount: true,
          uploadFinalized: true,
          finalizedUploadKey: true,
          transcodingFinishedAt: true,
          transcribingFinishedAt: true,
          transcodingProgress: true,
          transcribingProgress: true,
          variants: true,
          // Site-admin debug bundle (gated below; see `debug`).
          createdAt: true,
          updatedAt: true,
          uploadSizeBytes: true,
          lengthSeconds: true,
          originalFileName: true,
          transcodingStartedAt: true,
          transcribingStartedAt: true,
          pipelineVersion: true,
          transcodeEncoder: true,
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
                  canDownload: true,
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
        thumbnailCount,
        featuredUpload,
        variants,
        uploadListEntries,
        // Pulled out so they only reach the client inside the site-admin
        // `debug` bundle below, never the default payload.
        createdAt,
        updatedAt,
        uploadSizeBytes,
        lengthSeconds,
        originalFileName,
        transcodingStartedAt,
        transcribingStartedAt,
        pipelineVersion,
        transcodeEncoder,
        ...uploadRest
      } = upload;
      const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;

      const thumbnailUrl = thumbnailPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(thumbnailPath))
        : null;
      const overrideThumbnailUrl = overrideThumbnailPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(overrideThumbnailPath))
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

      const generatedThumbnailCount =
        hasVideo && thumbnailCount !== null
          ? Math.min(Math.max(thumbnailCount ?? 0, 0), MAX_GENERATED_THUMBNAILS)
          : 0;
      const generatedThumbnailsReady = hasVideo && thumbnailCount !== null;
      const generatedThumbnails = Array.from(
        { length: generatedThumbnailCount },
        (_, offset) => {
          const index = offset + 1;
          const path = generatedThumbnailPath(upload.id, index);

          return {
            index,
            url: getPublicImageUrl(publicS3.getS3ProtocolUri(path), {
              resize: { width: 320 },
            }),
            isSelected: path === thumbnailPath,
          };
        },
      );

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

      // Filter uploadListEntries to the single series belonging to this channel
      const seriesEntry = uploadListEntries.find(
        (e) =>
          e.uploadList.type === 'SERIES' &&
          e.uploadList.channelId === input.channelId,
      );

      // Internal processing metadata, surfaced only to site admins via the
      // upload page's debug modal.
      const debug = ctx.isSiteAdmin
        ? {
            createdAt,
            updatedAt,
            originalFileName,
            uploadSizeBytes:
              uploadSizeBytes != null ? Number(uploadSizeBytes) : null,
            lengthSeconds,
            pipelineVersion,
            transcodeEncoder,
            variants,
            finalizedUploadKey: upload.finalizedUploadKey,
            transcodingStartedAt,
            transcodingFinishedAt: upload.transcodingFinishedAt,
            transcribingStartedAt,
            transcribingFinishedAt: upload.transcribingFinishedAt,
          }
        : null;

      return {
        upload: {
          ...uploadRest,
          thumbnailUrl,
          overrideThumbnailUrl,
          generatedThumbnailsReady,
          generatedThumbnails,
          isFeatured: featuredUpload !== null,
          mediaSource,
          audioSource,
          series: seriesEntry
            ? {
                id: seriesEntry.uploadList.id,
                title: seriesEntry.uploadList.title,
                type: seriesEntry.uploadList.type,
              }
            : null,
          hasActiveWorkflow,
          debug,
        },
        channel: {
          ...upload.channel,
          userMembership,
        },
      };
    }),

  setGeneratedThumbnail: channelEditProcedure
    .input(
      uploadQuerySchema.extend({
        thumbnailIndex: z.number().int().min(1).max(MAX_GENERATED_THUMBNAILS),
      }),
    )
    .mutation(async ({ input }) => {
      const upload = await db.query.UploadRecord.findFirst({
        columns: {
          id: true,
          thumbnailCount: true,
          variants: true,
        },
        where: (t, { and, eq }) =>
          and(eq(t.id, input.uploadId), eq(t.channelId, input.channelId)),
      });

      if (!upload) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found or access denied',
        });
      }

      const hasVideo = upload.variants.some((variant) =>
        variant.startsWith('VIDEO'),
      );
      if (
        !hasVideo ||
        !upload.thumbnailCount ||
        input.thumbnailIndex > upload.thumbnailCount
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That generated thumbnail is not available',
        });
      }

      const path = generatedThumbnailPath(upload.id, input.thumbnailIndex);
      await db
        .update(UploadRecord)
        .set({
          overrideThumbnailPath: path,
          // A blurhash from a previous uploaded thumbnail would no longer
          // describe this generated frame.
          overrideThumbnailBlurhash: null,
          updatedAt: new Date(),
        })
        .where(eq(UploadRecord.id, upload.id));

      return {
        thumbnailUrl: getPublicImageUrl(publicS3.getS3ProtocolUri(path)),
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
      async ({
        input: { channelId, targetId, uploadMimeType, bytes, postProcess },
      }) => {
        // Bind the workflow target to the authorized channel. The client sends
        // `targetId` separately from the authorized `channelId`, so without this
        // a channel admin could point an upload at another channel's id/upload
        // record and overwrite its assets or finalize attacker media against it.
        let resolvedTargetId: string;
        if (postProcess === 'media' || postProcess === 'thumbnail') {
          // The target must be an upload record owned by this channel.
          const upload = await db.query.UploadRecord.findFirst({
            where: (t, { and, eq }) =>
              and(eq(t.id, targetId.toLowerCase()), eq(t.channelId, channelId)),
            columns: { id: true },
          });

          if (!upload) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Upload record not found in this channel',
            });
          }

          resolvedTargetId = upload.id;
        } else {
          // channelAvatar / channelDefaultThumbnail / channelCover always act on
          // the authorized channel itself; ignore any client-supplied targetId.
          resolvedTargetId = channelId;
        }

        const { uploadKey, uploadId } = await ingestS3.createMultipartUpload(
          resolvedTargetId,
          uploadMimeType,
        );

        await handleMultipartMediaUpload(
          resolvedTargetId,
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

    const uploadCountSq = db
      .select({
        uploadListId: UploadListEntry.uploadListId,
        cnt: count().as('playlist_upload_cnt'),
      })
      .from(UploadListEntry)
      .groupBy(UploadListEntry.uploadListId)
      .as('playlist_upload_counts');

    const playlists = await db
      .select({
        id: UploadList.id,
        title: UploadList.title,
        type: UploadList.type,
        visibility: UploadList.visibility,
        createdAt: UploadList.createdAt,
        updatedAt: UploadList.updatedAt,
        uploadCount: sql<number>`coalesce(${uploadCountSq.cnt}, 0)::int`,
      })
      .from(UploadList)
      .leftJoin(uploadCountSq, eq(UploadList.id, uploadCountSq.uploadListId))
      .where(eq(UploadList.channelId, input.channelId))
      .orderBy(desc(UploadList.createdAt));

    return playlists.map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      type: playlist.type,
      visibility: playlist.visibility,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      _count: { uploads: playlist.uploadCount },
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
      const uploadCountSq = db
        .select({
          uploadListId: UploadListEntry.uploadListId,
          cnt: count().as('series_upload_cnt'),
        })
        .from(UploadListEntry)
        .groupBy(UploadListEntry.uploadListId)
        .as('series_upload_counts');

      const series = await db
        .select({
          id: UploadList.id,
          title: UploadList.title,
          uploadCount: sql<number>`coalesce(${uploadCountSq.cnt}, 0)::int`,
        })
        .from(UploadList)
        .leftJoin(uploadCountSq, eq(UploadList.id, uploadCountSq.uploadListId))
        .where(
          and(
            eq(UploadList.channelId, input.channelId),
            eq(UploadList.type, 'SERIES'),
            ilike(UploadList.title, `%${escapeLikePattern(input.query)}%`),
          ),
        )
        .orderBy(desc(UploadList.createdAt))
        .limit(10);

      return series.map((s) => ({
        id: s.id,
        title: s.title,
        _count: { uploads: s.uploadCount },
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
          visibility: true,
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
            visibility: input.visibility,
            authorId: ctx.session.appUser.id,
            channelId: input.channelId,
            updatedAt: new Date(),
          })
          .returning({
            id: UploadList.id,
            title: UploadList.title,
            type: UploadList.type,
            visibility: UploadList.visibility,
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
            ...(input.visibility ? { visibility: input.visibility } : {}),
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
            visibility: UploadList.visibility,
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

        await db
          .delete(UploadList)
          .where(
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
          columns: { id: true, channelId: true, type: true },
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

        // If adding to a series, enforce one-series-per-upload
        if (playlist.type === 'SERIES') {
          const existingSeries = await db.query.UploadListEntry.findFirst({
            columns: { uploadListId: true },
            with: {
              uploadList: { columns: { type: true } },
            },
            where: (t, { and, eq, ne }) =>
              and(
                eq(t.uploadRecordId, input.uploadId),
                ne(t.uploadListId, input.playlistId),
              ),
          });

          if (existingSeries?.uploadList.type === 'SERIES') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Upload already belongs to a series',
            });
          }
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

  bulkImportMedia: siteAdminChannelProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        filename: z.string().trim().min(1).max(255),
        csv: z.string().min(1).max(MAX_BULK_MEDIA_IMPORT_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let items: ReturnType<typeof parseBulkMediaImportCsv>;
      try {
        items = parseBulkMediaImportCsv(input.csv);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            error instanceof Error ? error.message : 'The CSV is invalid.',
        });
      }

      try {
        const { workflowCount } = await triggerBulkMediaImport(
          input.channelId,
          ctx.session.appUserId,
          input.filename,
          items,
        );

        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: { itemCount: items.length, workflowCount },
          },
          'Bulk import workflows started',
        );

        return { success: true, itemCount: items.length, workflowCount };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              itemCount: items.length,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start bulk import workflows',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start the bulk import.',
        });
      }
    }),
});
