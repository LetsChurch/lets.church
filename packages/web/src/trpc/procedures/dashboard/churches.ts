import {
  db,
  Organization,
  OrganizationAddress,
  OrganizationChannelAssociation,
  OrganizationInvitation,
  OrganizationLeader,
  OrganizationMembership,
  OrganizationOrganizationAssociation,
  OrganizationTagInstance,
} from '@letschurch/db';
import { PART_SIZE } from '@letschurch/s3';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { invariant, isEqual, pick } from 'es-toolkit';
import {
  finalizeMultipartUploadSchema,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  addLeaderSchema,
  cancelChurchInvitationSchema,
  channelSearchChurchSchema,
  churchQuerySchema,
  createChurchSchema,
  inviteChurchMemberSchema,
  linkChannelSchema,
  removeChurchMemberSchema,
  removeLeaderSchema,
  resendChurchInvitationSchema,
  unlinkChannelSchema,
  updateChurchSchema,
  updateLeaderSchema,
} from '@/schemas/dashboard';
import {
  completeMultipartMediaUpload,
  geocodeOrganization,
  handleMultipartMediaUpload,
  sendInvitationEmail,
} from '@/temporal';
import {
  mantineAvatarLg2x,
  mantineAvatarSm2x,
  mantineAvatarXl2x,
} from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { getPublicImageUrl } from '@/util/server-env';
import { slugify } from '@/util/slugify';
import { uuidTranslator } from '@/util/uuid';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/churches',
});

const churchProcedure = authProcedure
  .input(churchQuerySchema)
  .use(async ({ ctx, input, next }) => {
    // Site admins have full access to all churches
    if (ctx.isSiteAdmin) {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
          },
        },
        'Site admin accessing church',
      );

      // Create a virtual admin membership for site admins
      return next({
        ctx: {
          ...ctx,
          membership: {
            appUserId: ctx.session.appUserId,
            organizationId: input.churchId,
            isAdmin: true,
            canEdit: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      });
    }

    const membership = await db.query.OrganizationMembership.findFirst({
      where: (t, { and, eq }) =>
        and(
          eq(t.appUserId, ctx.session.appUserId),
          eq(t.organizationId, input.churchId),
        ),
    });

    if (!membership) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'No membership found for church procedure',
      );

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({ ctx: { ...ctx, membership } });
  });

const churchAdminProcedure = churchProcedure.use(async ({ ctx, next }) => {
  if (!ctx.membership.isAdmin) {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
      },
      'User is not admin of church',
    );

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const churchRouter = router({
  getOrganizationTags: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching organization tags',
    );

    const tags = await db.query.OrganizationTag.findMany({
      columns: {
        slug: true,
        label: true,
        category: true,
      },
      orderBy: (t, { asc }) => [asc(t.category), asc(t.label)],
    });

    return tags;
  }),

  createChurch: authProcedure
    .input(createChurchSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            name: input.name,
          },
        },
        'Creating church',
      );

      try {
        const slug = input.slug || slugify(input.name);

        // Get the tag slugs from the single tags array
        const allTagSlugs = input.tags || [];

        const church = await db.transaction(async (tx) => {
          const [newChurch] = await tx
            .insert(Organization)
            .values({
              name: input.name,
              slug,
              description: input.description || null,
              type: 'CHURCH',
              websiteUrl: input.websiteUrl || null,
              primaryEmail: input.primaryEmail || null,
              primaryPhoneNumber: input.primaryPhoneNumber || null,
              automaticallyApproveOrganizationAssociations: false,
              updatedAt: new Date(),
            })
            .returning({ id: Organization.id });

          if (!newChurch) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
          }

          await tx.insert(OrganizationMembership).values({
            organizationId: newChurch.id,
            appUserId: ctx.session.appUserId,
            isAdmin: true,
            canEdit: true,
            updatedAt: new Date(),
          });

          if (allTagSlugs.length > 0) {
            await tx.insert(OrganizationTagInstance).values(
              allTagSlugs.map((tagSlug) => ({
                organizationId: newChurch.id,
                tagSlug,
              })),
            );
          }

          if (input.addresses && input.addresses.length > 0) {
            await tx.insert(OrganizationAddress).values(
              input.addresses.map((address) => ({
                organizationId: newChurch.id,
                type: address.type,
                name: address.name || null,
                streetAddress: address.streetAddress || null,
                locality: address.locality || null,
                region: address.region || null,
                postalCode: address.postalCode || null,
                country: address.country || null,
                postOfficeBoxNumber: address.postOfficeBoxNumber || null,
              })),
            );
          }

          return newChurch;
        });

        // Handle organization associations if provided
        if (
          input.associatedOrganizations &&
          input.associatedOrganizations.length > 0
        ) {
          await db.insert(OrganizationOrganizationAssociation).values(
            input.associatedOrganizations.map((upstreamOrgId) => ({
              upstreamOrganizationId: upstreamOrgId,
              downstreamOrganizationId: church.id,
              downstreamApproved: true, // Church automatically approves being downstream
              upstreamApproved: false, // Upstream organization needs to approve
              updatedAt: new Date(),
            })),
          );
        }

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              churchId: church.id,
            },
          },
          'Church created successfully',
        );

        // Trigger geocoding if addresses were provided
        if (input.addresses && input.addresses.length > 0) {
          await geocodeOrganization(church.id);
          moduleLogger.info(
            {
              appUserId: ctx.session.appUserId,
              context: {
                churchId: church.id,
              },
            },
            'Geocoding workflow triggered for new church addresses',
          );
        }

        return church;
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to create church',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create church',
        });
      }
    }),

  getChurches: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching churches for user',
    );

    // Get memberships for this user
    const memberships = await db.query.OrganizationMembership.findMany({
      where: (t, { eq }) => eq(t.appUserId, ctx.session.appUserId),
    });

    const orgIds = memberships.map((m) => m.organizationId);
    if (orgIds.length === 0) return [];

    const churches = await db.query.Organization.findMany({
      columns: {
        id: true,
        name: true,
        type: true,
        description: true,
      },
      where: (t, { and, eq, inArray }) =>
        and(eq(t.type, 'CHURCH'), inArray(t.id, orgIds)),
    });

    return churches.map((church) => {
      const membership = memberships.find(
        (m) => m.organizationId === church.id,
      );
      return {
        ...church,
        memberships: membership
          ? [{ isAdmin: membership.isAdmin, canEdit: membership.canEdit }]
          : [],
      };
    });
  }),

  getChurchDetails: churchProcedure.query(async ({ ctx, input }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching church details',
    );

    const church = await db.query.Organization.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.id, input.churchId), eq(t.type, 'CHURCH')),
      with: {
        memberships: {
          with: {
            appUser: {
              with: {
                emails: {
                  columns: { email: true, verifiedAt: true },
                },
              },
              columns: {
                id: true,
                username: true,
                fullName: true,
                avatarPath: true,
              },
            },
          },
        },
        channelAssociations: {
          with: {
            channel: {
              columns: {
                id: true,
                name: true,
                visibility: true,
                createdAt: true,
              },
            },
          },
          columns: {
            officialChannel: true,
          },
        },
        leaders: {
          columns: {
            id: true,
            type: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        addresses: {
          columns: {
            id: true,
            type: true,
            name: true,
            streetAddress: true,
            locality: true,
            region: true,
            postalCode: true,
            country: true,
          },
        },
      },
    });

    if (!church) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'Church not found',
      );

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Sort memberships: isAdmin desc, createdAt asc
    const sortedMemberships = [...church.memberships].sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const { avatarPath, ...churchWithoutPath } = church;
    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarXl2x,
        })
      : null;

    // Member email addresses are admin-only; ordinary members can call this too.
    const canSeeMemberEmails = ctx.isSiteAdmin || !!ctx.membership?.isAdmin;
    const membershipsWithAvatarUrl = sortedMemberships.map((membership) => {
      const { avatarPath: userAvatarPath, ...userWithoutPath } =
        membership.appUser;
      const userAvatarUrl = userAvatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(userAvatarPath), {
            resize: mantineAvatarSm2x,
          })
        : null;

      return {
        ...membership,
        appUser: {
          ...userWithoutPath,
          emails: canSeeMemberEmails ? userWithoutPath.emails : [],
          avatarUrl: userAvatarUrl,
        },
      };
    });

    return {
      ...churchWithoutPath,
      avatarUrl,
      memberships: membershipsWithAvatarUrl,
      _count: {
        memberships: church.memberships.length,
        channelAssociations: church.channelAssociations.length,
        leaders: church.leaders.length,
      },
      userMembership: ctx.membership,
    };
  }),

  getChurchMembers: churchProcedure.query(async ({ ctx, input }) => {
    const church = await db.query.Organization.findFirst({
      columns: {
        id: true,
        name: true,
        slug: true,
      },
      where: (t, { and, eq }) =>
        and(eq(t.id, input.churchId), eq(t.type, 'CHURCH')),
      with: {
        memberships: {
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
    });

    if (!church) {
      moduleLogger.warn('Church not found for members');

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Sort memberships: isAdmin desc, createdAt asc
    const sortedMemberships = [...church.memberships].sort((a, b) => {
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
      ...church,
      memberships: membershipsWithAvatarUrl,
      userMembership: ctx.membership,
    };
  }),

  inviteToChurch: churchAdminProcedure
    .input(inviteChurchMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
          },
        },
        'Inviting user to church',
      );

      // Check if email already belongs to a member
      // First find user with that email
      const userEmail = await db.query.AppUserEmail.findFirst({
        where: (t, { eq }) => eq(t.email, input.email),
        columns: { appUserId: true },
      });

      if (userEmail) {
        const existingMember = await db.query.OrganizationMembership.findFirst({
          where: (t, { and, eq }) =>
            and(
              eq(t.organizationId, input.churchId),
              eq(t.appUserId, userEmail.appUserId),
            ),
        });

        // Return success without revealing membership state to prevent user enumeration
        if (existingMember) {
          return { success: true, message: 'Invitation sent successfully' };
        }
      }

      // Check for existing pending invitation
      const existingInvitation =
        await db.query.OrganizationInvitation.findFirst({
          where: (t, { and, eq }) =>
            and(eq(t.organizationId, input.churchId), eq(t.email, input.email)),
        });

      // Return success without revealing invitation state to prevent user enumeration
      if (
        existingInvitation &&
        existingInvitation.status === 'PENDING' &&
        existingInvitation.expiresAt > new Date()
      ) {
        return { success: true, message: 'Invitation sent successfully' };
      }

      // Create or update invitation
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [invitation] = await db
        .insert(OrganizationInvitation)
        .values({
          organizationId: input.churchId,
          email: input.email,
          isAdmin: input.isAdmin,
          canEdit: input.canEdit,
          invitedById: ctx.session.appUserId,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [
            OrganizationInvitation.organizationId,
            OrganizationInvitation.email,
          ],
          set: {
            status: 'PENDING',
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
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
        type: 'organization',
      });

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            invitationId: invitation.id,
          },
        },
        'Church invitation created and email sent',
      );

      // Return identical success message for security (no user enumeration)
      return { success: true, message: 'Invitation sent successfully' };
    }),

  getChurchInvitations: churchAdminProcedure
    .input(churchQuerySchema)
    .query(async ({ input }) => {
      const invitations = await db.query.OrganizationInvitation.findMany({
        where: (t, { and, eq, gt }) =>
          and(
            eq(t.organizationId, input.churchId),
            eq(t.status, 'PENDING'),
            gt(t.expiresAt, new Date()),
          ),
        columns: {
          id: true,
          email: true,
          isAdmin: true,
          canEdit: true,
          createdAt: true,
          expiresAt: true,
          token: true,
        },
        with: {
          invitedBy: {
            columns: {
              username: true,
              fullName: true,
            },
          },
        },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      return invitations.map(({ token, ...inv }) => ({
        ...inv,
        token: uuidTranslator.fromUUID(token),
      }));
    }),

  cancelChurchInvitation: churchAdminProcedure
    .input(cancelChurchInvitationSchema)
    .mutation(async ({ input }) => {
      // Use update with both id and churchId to ensure the invitation belongs to the church
      const result = await db
        .update(OrganizationInvitation)
        .set({ status: 'CANCELLED' })
        .where(
          and(
            eq(OrganizationInvitation.id, input.invitationId),
            eq(OrganizationInvitation.organizationId, input.churchId),
          ),
        )
        .returning({ id: OrganizationInvitation.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      return { success: true };
    }),

  resendChurchInvitation: churchAdminProcedure
    .input(resendChurchInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      // First fetch and validate the invitation
      const existingInvitation =
        await db.query.OrganizationInvitation.findFirst({
          where: (t, { and, eq }) =>
            and(
              eq(t.id, input.invitationId),
              eq(t.organizationId, input.churchId),
            ),
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
        .update(OrganizationInvitation)
        .set({
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .where(eq(OrganizationInvitation.id, input.invitationId))
        .returning();

      if (!invitation) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }

      // Send invitation email
      await sendInvitationEmail({
        invitationId: invitation.id,
        type: 'organization',
      });

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            invitationId: invitation.id,
          },
        },
        'Church invitation resent',
      );

      return { success: true };
    }),

  removeChurchMember: churchAdminProcedure
    .input(removeChurchMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            churchId: input.churchId,
            memberToRemove: input.appUserId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing church member',
      );

      try {
        let wasAdmin = false;
        await db.transaction(async (tx) => {
          // Don't allow removing the last admin
          const adminMembers = await tx.query.OrganizationMembership.findMany({
            where: (t, { and, eq }) =>
              and(eq(t.organizationId, input.churchId), eq(t.isAdmin, true)),
            columns: { appUserId: true },
          });
          const adminCount = adminMembers.length;

          const membershipToDelete =
            await tx.query.OrganizationMembership.findFirst({
              where: (t, { and, eq }) =>
                and(
                  eq(t.organizationId, input.churchId),
                  eq(t.appUserId, input.appUserId),
                ),
              columns: { isAdmin: true, appUserId: true },
            });

          if (!membershipToDelete) {
            moduleLogger.warn(
              {
                context: {
                  churchId: input.churchId,
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
                context: {
                  churchId: input.churchId,
                  memberToRemove: input.appUserId,
                  removedBy: ctx.session.appUserId,
                },
              },
              'Cannot remove last admin from church',
            );
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot remove the last admin from the church',
            });
          }

          await tx
            .delete(OrganizationMembership)
            .where(
              and(
                eq(OrganizationMembership.organizationId, input.churchId),
                eq(OrganizationMembership.appUserId, input.appUserId),
              ),
            );
        });

        moduleLogger.info(
          {
            context: {
              churchId: input.churchId,
              memberRemoved: input.appUserId,
              removedBy: ctx.session.appUserId,
              wasAdmin,
            },
          },
          'Church member removed successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            context: {
              churchId: input.churchId,
              memberToRemove: input.appUserId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove church member',
        );
        throw error;
      }
    }),

  searchChannels: churchAdminProcedure
    .input(channelSearchChurchSchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            query: input.query,
          },
        },
        'Searching channels for church',
      );

      // Get channel IDs already associated with this church
      const existingAssociations =
        await db.query.OrganizationChannelAssociation.findMany({
          where: (t, { eq }) => eq(t.organizationId, input.churchId),
          columns: { channelId: true },
        });
      const associatedChannelIds = existingAssociations.map((a) => a.channelId);

      const channelsQuery = db.query.Channel.findMany({
        columns: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          description: true,
        },
        where: (t, { and, eq, notInArray, ilike, isNotNull, isNull }) => {
          const escapedQuery = input.query
            .replace(/\\/g, '\\\\')
            .replace(/%/g, '\\%')
            .replace(/_/g, '\\_');
          // Only public, approved, non-deleted channels can be linked. A church
          // admin must not be able to discover or endorse private/unapproved
          // channels (which would also expose their metadata publicly).
          const baseCondition = and(
            ilike(t.name, `%${escapedQuery}%`),
            eq(t.visibility, 'PUBLIC'),
            isNotNull(t.approvedAt),
            isNull(t.deletedAt),
          );
          if (associatedChannelIds.length > 0) {
            return and(baseCondition, notInArray(t.id, associatedChannelIds));
          }
          return baseCondition;
        },
        limit: 10,
      });

      const channels = await channelsQuery;

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
            query: input.query,
            resultCount: channels.length,
          },
        },
        'Channel search completed',
      );

      return channels;
    }),

  linkChannel: churchAdminProcedure
    .input(linkChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          context: {
            churchId: input.churchId,
            officialChannel: input.officialChannel,
            linkedBy: ctx.session.appUserId,
          },
        },
        'Linking channel to church',
      );

      try {
        // Only allow linking public, approved, non-deleted channels. Without
        // this, a church admin could associate (and thereby publicly surface) an
        // arbitrary private/unapproved channel by id.
        const channel = await db.query.Channel.findFirst({
          columns: { id: true },
          where: (t, { and, eq, isNotNull, isNull }) =>
            and(
              eq(t.id, input.channelId),
              eq(t.visibility, 'PUBLIC'),
              isNotNull(t.approvedAt),
              isNull(t.deletedAt),
            ),
        });

        if (!channel) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Channel not found',
          });
        }

        await db.insert(OrganizationChannelAssociation).values({
          organizationId: input.churchId,
          channelId: input.channelId,
          officialChannel: input.officialChannel,
          updatedAt: new Date(),
        });

        moduleLogger.info(
          {
            channelId: input.channelId,
            context: {
              churchId: input.churchId,
              officialChannel: input.officialChannel,
              linkedBy: ctx.session.appUserId,
            },
          },
          'Channel linked to church successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            context: {
              churchId: input.churchId,
              linkedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to link channel to church',
        );
        throw error;
      }
    }),

  unlinkChannel: churchAdminProcedure
    .input(unlinkChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          context: {
            churchId: input.churchId,
            unlinkedBy: ctx.session.appUserId,
          },
        },
        'Unlinking channel from church',
      );

      try {
        const association =
          await db.query.OrganizationChannelAssociation.findFirst({
            where: (t, { and, eq }) =>
              and(
                eq(t.organizationId, input.churchId),
                eq(t.channelId, input.channelId),
              ),
            columns: { organizationId: true },
          });

        if (!association) {
          moduleLogger.warn(
            {
              channelId: input.channelId,
              context: {
                churchId: input.churchId,
                unlinkedBy: ctx.session.appUserId,
              },
            },
            'Channel association not found',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Channel association not found',
          });
        }

        await db
          .delete(OrganizationChannelAssociation)
          .where(
            and(
              eq(OrganizationChannelAssociation.organizationId, input.churchId),
              eq(OrganizationChannelAssociation.channelId, input.channelId),
            ),
          );

        moduleLogger.info(
          {
            channelId: input.channelId,
            context: {
              churchId: input.churchId,
              unlinkedBy: ctx.session.appUserId,
            },
          },
          'Channel unlinked from church successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            context: {
              churchId: input.churchId,
              unlinkedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to unlink channel from church',
        );
        throw error;
      }
    }),

  addLeader: churchAdminProcedure
    .input(addLeaderSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            churchId: input.churchId,
            leaderType: input.type,
            leaderName: input.name,
            addedBy: ctx.session.appUserId,
          },
        },
        'Adding church leader',
      );

      try {
        const [leader] = await db
          .insert(OrganizationLeader)
          .values({
            organizationId: input.churchId,
            type: input.type,
            name: input.name,
            email: input.email || null,
            phoneNumber: input.phoneNumber || null,
          })
          .returning();

        moduleLogger.info(
          {
            context: {
              churchId: input.churchId,
              leaderId: leader?.id,
              leaderType: input.type,
              leaderName: input.name,
              addedBy: ctx.session.appUserId,
            },
          },
          'Church leader added successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              churchId: input.churchId,
              leaderType: input.type,
              leaderName: input.name,
              addedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to add church leader',
        );
        throw error;
      }
    }),

  updateLeader: churchAdminProcedure
    .input(updateLeaderSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            leaderId: input.leaderId,
            leaderType: input.type,
            leaderName: input.name,
            updatedBy: ctx.session.appUserId,
          },
        },
        'Updating church leader',
      );

      try {
        const [updatedLeader] = await db
          .update(OrganizationLeader)
          .set({
            type: input.type,
            name: input.name,
            email: input.email || null,
            phoneNumber: input.phoneNumber || null,
          })
          .where(
            and(
              eq(OrganizationLeader.id, input.leaderId),
              eq(OrganizationLeader.organizationId, input.churchId),
            ),
          )
          .returning({ id: OrganizationLeader.id });

        if (!updatedLeader) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        moduleLogger.info(
          {
            context: {
              leaderId: input.leaderId,
              leaderType: input.type,
              leaderName: input.name,
              updatedBy: ctx.session.appUserId,
            },
          },
          'Church leader updated successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              leaderId: input.leaderId,
              leaderType: input.type,
              leaderName: input.name,
              updatedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to update church leader',
        );
        throw error;
      }
    }),

  removeLeader: churchAdminProcedure
    .input(removeLeaderSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          context: {
            leaderId: input.leaderId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing church leader',
      );

      try {
        // Scope the lookup and delete to the authorized church. The caller only
        // proved admin rights to input.churchId, so a leader id from another
        // church must not be deletable here.
        const leader = await db.query.OrganizationLeader.findFirst({
          where: (t, { and, eq }) =>
            and(eq(t.id, input.leaderId), eq(t.organizationId, input.churchId)),
          columns: { id: true },
        });

        if (!leader) {
          moduleLogger.warn(
            {
              context: {
                leaderId: input.leaderId,
                removedBy: ctx.session.appUserId,
              },
            },
            'Church leader not found',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Leader not found',
          });
        }

        await db
          .delete(OrganizationLeader)
          .where(
            and(
              eq(OrganizationLeader.id, input.leaderId),
              eq(OrganizationLeader.organizationId, input.churchId),
            ),
          );

        moduleLogger.info(
          {
            context: {
              leaderId: input.leaderId,
              removedBy: ctx.session.appUserId,
            },
          },
          'Church leader removed successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              leaderId: input.leaderId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove church leader',
        );
        throw error;
      }
    }),

  getChurchForEdit: churchAdminProcedure.query(async ({ ctx, input }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching church for edit',
    );

    const church = await db.query.Organization.findFirst({
      columns: {
        id: true,
        name: true,
        description: true,
        websiteUrl: true,
        primaryEmail: true,
        primaryPhoneNumber: true,
        avatarPath: true,
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
      },
      where: (t, { and, eq }) =>
        and(eq(t.id, input.churchId), eq(t.type, 'CHURCH')),
      with: {
        tags: {
          columns: { tagSlug: true },
        },
        upstreamOrganizationAssociations: {
          columns: {
            upstreamOrganizationId: true,
            upstreamApproved: true,
          },
        },
        addresses: {
          columns: {
            type: true,
            name: true,
            streetAddress: true,
            locality: true,
            region: true,
            postalCode: true,
            country: true,
            postOfficeBoxNumber: true,
          },
        },
      },
    });

    if (!church) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'Church not found for edit',
      );

      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const { avatarPath, ...restChurch } = church;
    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarLg2x,
        })
      : null;

    // Transform tags to a flat array of strings and associated organizations
    return {
      ...restChurch,
      avatarUrl,
      tags: church.tags.map((tag) => tag.tagSlug),
      associatedOrganizations: church.upstreamOrganizationAssociations.map(
        (assoc) => assoc.upstreamOrganizationId,
      ),
      associatedOrganizationsWithStatus:
        church.upstreamOrganizationAssociations.map((assoc) => ({
          organizationId: assoc.upstreamOrganizationId,
          upstreamApproved: assoc.upstreamApproved,
        })),
    };
  }),

  updateChurch: churchAdminProcedure
    .input(updateChurchSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            churchId: input.churchId,
          },
        },
        'Updating church',
      );

      try {
        let hasNewAddresses = false;

        await db.transaction(async (tx) => {
          // Handle tag updates if provided
          if (input.tags !== undefined) {
            // First, delete all existing tags
            await tx
              .delete(OrganizationTagInstance)
              .where(
                eq(OrganizationTagInstance.organizationId, input.churchId),
              );

            // Then, create new tag instances if tags are provided
            if (input.tags.length > 0) {
              await tx.insert(OrganizationTagInstance).values(
                input.tags.map((tagSlug) => ({
                  organizationId: input.churchId,
                  tagSlug,
                })),
              );
            }
          }

          // Handle organization associations if provided
          if (input.associatedOrganizations !== undefined) {
            // First, delete all existing upstream associations (church is downstream)
            await tx
              .delete(OrganizationOrganizationAssociation)
              .where(
                eq(
                  OrganizationOrganizationAssociation.downstreamOrganizationId,
                  input.churchId,
                ),
              );

            // Then, create new associations if provided
            if (input.associatedOrganizations.length > 0) {
              await tx.insert(OrganizationOrganizationAssociation).values(
                input.associatedOrganizations.map((upstreamOrgId) => ({
                  upstreamOrganizationId: upstreamOrgId,
                  downstreamOrganizationId: input.churchId,
                  downstreamApproved: true, // Church automatically approves being downstream
                  upstreamApproved: false, // Upstream organization needs to approve
                  updatedAt: new Date(),
                })),
              );
            }
          }

          // Handle addresses if provided
          if (input.addresses !== undefined) {
            // Fetch existing addresses with their geocoding data
            const existingAddresses =
              await tx.query.OrganizationAddress.findMany({
                where: (t, { eq }) => eq(t.organizationId, input.churchId),
              });

            // Helper to check if two addresses are the same (comparing only user-editable fields)
            const addressesMatch = (
              a: Record<string, unknown>,
              b: Record<string, unknown>,
            ): boolean => {
              const editableFields = [
                'type',
                'name',
                'streetAddress',
                'locality',
                'region',
                'postalCode',
                'country',
                'postOfficeBoxNumber',
              ] as const;
              return isEqual(pick(a, editableFields), pick(b, editableFields));
            };

            // Track which existing addresses we're keeping
            const existingAddressIdsToKeep = new Set<string>();

            // Process each input address
            for (const inputAddress of input.addresses) {
              // Check if this address already exists
              const matchingExisting = existingAddresses.find(
                (existing) =>
                  !existingAddressIdsToKeep.has(existing.id) &&
                  addressesMatch(inputAddress, existing),
              );

              if (matchingExisting) {
                // Address unchanged, keep it with its geocoding data
                existingAddressIdsToKeep.add(matchingExisting.id);
              } else {
                // New or changed address, create it
                await tx.insert(OrganizationAddress).values({
                  organizationId: input.churchId,
                  type: inputAddress.type,
                  name: inputAddress.name || null,
                  streetAddress: inputAddress.streetAddress || null,
                  locality: inputAddress.locality || null,
                  region: inputAddress.region || null,
                  postalCode: inputAddress.postalCode || null,
                  country: inputAddress.country || null,
                  postOfficeBoxNumber: inputAddress.postOfficeBoxNumber || null,
                });
                hasNewAddresses = true;
              }
            }

            // Delete addresses that are no longer in the input
            const addressIdsToDelete = existingAddresses
              .filter((existing) => !existingAddressIdsToKeep.has(existing.id))
              .map((addr) => addr.id);

            if (addressIdsToDelete.length > 0) {
              await tx
                .delete(OrganizationAddress)
                .where(inArray(OrganizationAddress.id, addressIdsToDelete));
            }
          }

          await tx
            .update(Organization)
            .set({
              name: input.name,
              description: input.description || null,
              websiteUrl: input.websiteUrl || null,
              primaryEmail: input.primaryEmail || null,
              primaryPhoneNumber: input.primaryPhoneNumber || null,
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
              updatedAt: new Date(),
            })
            .where(eq(Organization.id, input.churchId));
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              churchId: input.churchId,
            },
          },
          'Church updated successfully',
        );

        // Trigger geocoding only if new addresses were created
        if (hasNewAddresses) {
          await geocodeOrganization(input.churchId);
          moduleLogger.info(
            {
              appUserId: ctx.session.appUserId,
              context: {
                churchId: input.churchId,
              },
            },
            'Geocoding workflow triggered for new church addresses',
          );
        }

        return { error: false };
      } catch (e) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              churchId: input.churchId,
              error: e instanceof Error ? e.message : String(e),
            },
          },
          'Church update failed',
        );
        return { error: 'Error updating church, please try again!' };
      }
    }),

  createMultipartUpload: churchAdminProcedure
    .input(multipartUploadSchema)
    .mutation(async ({ input: { churchId, uploadMimeType, bytes } }) => {
      // The organization avatar always belongs to the authorized church. Ignore
      // any client-supplied targetId: trusting it would let a church admin
      // overwrite another organization's avatar by passing its id.
      const targetId = churchId;

      const { uploadKey, uploadId } = await ingestS3.createMultipartUpload(
        targetId,
        uploadMimeType,
      );

      await handleMultipartMediaUpload(
        targetId,
        'INGEST',
        uploadId,
        uploadKey,
        'organizationAvatar',
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
    }),

  finalizeMultipartUpload: churchAdminProcedure
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
