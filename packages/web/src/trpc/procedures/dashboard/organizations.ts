import {
  db,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  OrganizationOrganizationAssociation,
} from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { TRPCError } from '@trpc/server';
import { and, count, eq, sql } from 'drizzle-orm';

import {
  cancelOrganizationInvitationSchema,
  getAllOrganizationsSchema,
  getOrganizationsByIdsSchema,
  inviteOrganizationMemberSchema,
  organizationQuerySchema,
  organizationRelationshipSchema,
  removeOrganizationMemberSchema,
  resendOrganizationInvitationSchema,
  searchOrganizationsSchema,
  updateOrganizationSchema,
  upstreamAssociationActionSchema,
} from '@/schemas/dashboard';
import { sendInvitationEmail } from '@/temporal';
import { mantineAvatarSm2x, mantineAvatarXl2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { getPublicImageUrl } from '@/util/server-env';
import { uuidTranslator } from '@/util/uuid';

import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/organizations',
});

const organizationProcedure = authProcedure
  .input(organizationQuerySchema)
  .use(async ({ ctx, input, next }) => {
    // Skip membership query for site admins
    const membership = ctx.isSiteAdmin
      ? null
      : await db.query.OrganizationMembership.findFirst({
          where: (t, { and, eq }) =>
            and(
              eq(t.appUserId, ctx.session.appUserId),
              eq(t.organizationId, input.orgId),
            ),
        });

    if (!ctx.isSiteAdmin && !membership) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'No membership found for organization procedure',
      );

      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    // Compute permissions (site admins and org admins have all permissions)
    const canAdmin = ctx.isSiteAdmin || !!membership?.isAdmin;
    const canEdit = canAdmin || !!membership?.canEdit;

    return next({
      ctx: {
        ...ctx,
        membership,
        canAdmin,
        canEdit,
      },
    });
  });

const organizationAdminProcedure = organizationProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.canAdmin) {
      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
        },
        'User is not admin of organization',
      );

      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    return next();
  },
);

export const organizationRouter = router({
  getAllOrganizations: authProcedure
    .input(getAllOrganizationsSchema)
    .query(async ({ input }) => {
      moduleLogger.info(
        {
          context: {
            excludeChurchTypes: input.excludeChurchTypes,
          },
        },
        'Fetching all organizations',
      );

      const orgs = await db.query.Organization.findMany({
        columns: {
          id: true,
          name: true,
          type: true,
          approvedAt: true,
        },
        where: input.excludeChurchTypes
          ? (t, { ne }) => ne(t.type, 'CHURCH')
          : undefined,
        orderBy: (t, { desc, asc }) => [desc(t.approvedAt), asc(t.name)],
      });

      return orgs;
    }),

  searchOrganizations: authProcedure
    .input(searchOrganizationsSchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            query: input.query,
            excludeChurchTypes: input.excludeChurchTypes,
            limit: input.limit,
          },
        },
        'Searching organizations',
      );

      const organizations = await db.query.Organization.findMany({
        columns: {
          id: true,
          name: true,
          type: true,
          approvedAt: true,
        },
        where: (t, { and, ne, ilike }) => {
          const escapedQuery = input.query.replace(/([%_\\])/g, '\\$1');
          const nameCondition = ilike(t.name, `%${escapedQuery}%`);
          if (input.excludeChurchTypes) {
            return and(nameCondition, ne(t.type, 'CHURCH'));
          }
          return nameCondition;
        },
        orderBy: (t, { desc, asc }) => [desc(t.approvedAt), asc(t.name)],
        limit: input.limit,
      });

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            query: input.query,
            resultCount: organizations.length,
            excludeChurchTypes: input.excludeChurchTypes,
          },
        },
        'Organization search completed',
      );

      return organizations;
    }),

  getOrganizationsByIds: authProcedure
    .input(getOrganizationsByIdsSchema)
    .query(async ({ input }) => {
      moduleLogger.info(
        {
          context: {
            organizationCount: input.organizationIds.length,
          },
        },
        'Fetching organizations by IDs',
      );

      if (input.organizationIds.length === 0) {
        return [];
      }

      return db.query.Organization.findMany({
        columns: {
          id: true,
          name: true,
          type: true,
          approvedAt: true,
        },
        where: (t, { inArray }) => inArray(t.id, input.organizationIds),
        orderBy: (t, { desc, asc }) => [desc(t.approvedAt), asc(t.name)],
      });
    }),

  getOrganizations: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Fetching organizations for user',
    );

    // Get memberships for this user
    const memberships = await db.query.OrganizationMembership.findMany({
      where: (t, { eq }) => eq(t.appUserId, ctx.session.appUserId),
    });

    const orgIds = memberships.map((m) => m.organizationId);
    if (orgIds.length === 0) return [];

    const organizations = await db.query.Organization.findMany({
      columns: {
        id: true,
        name: true,
        type: true,
        description: true,
        approvedAt: true,
      },
      where: (t, { and, eq, inArray }) =>
        and(eq(t.type, 'MINISTRY'), inArray(t.id, orgIds)),
    });

    return organizations.map((org) => {
      const membership = memberships.find((m) => m.organizationId === org.id);
      return {
        ...org,
        memberships: membership
          ? [{ isAdmin: membership.isAdmin, canEdit: membership.canEdit }]
          : [],
      };
    });
  }),

  getOrganizationDetails: organizationProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching organization details',
      );

      const organization = await db.query.Organization.findFirst({
        columns: {
          id: true,
          name: true,
          slug: true,
          description: true,
          type: true,
          avatarPath: true,
          primaryEmail: true,
          primaryPhoneNumber: true,
          websiteUrl: true,
          createdAt: true,
          updatedAt: true,
          approvedAt: true,
          approvedById: true,
        },
        where: (t, { and, eq }) =>
          and(eq(t.id, input.orgId), eq(t.type, 'MINISTRY')),
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
        },
      });

      if (!organization) {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
          },
          'Organization not found',
        );

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const [unapprovedAssociationsRows, downstreamCountRows] =
        await Promise.all([
          db
            .select({ cnt: count() })
            .from(OrganizationOrganizationAssociation)
            .where(
              and(
                eq(
                  OrganizationOrganizationAssociation.upstreamOrganizationId,
                  input.orgId,
                ),
                eq(OrganizationOrganizationAssociation.upstreamApproved, false),
              ),
            ),
          db
            .select({ cnt: count() })
            .from(OrganizationOrganizationAssociation)
            .where(
              eq(
                OrganizationOrganizationAssociation.upstreamOrganizationId,
                input.orgId,
              ),
            ),
        ]);
      const unapprovedAssociationsCount =
        unapprovedAssociationsRows[0]?.cnt ?? 0;
      const downstreamOrganizationAssociationsCount = Number(
        downstreamCountRows[0]?.cnt ?? 0,
      );

      // Sort memberships: isAdmin desc, createdAt asc
      const sortedMemberships = [...organization.memberships].sort((a, b) => {
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      const { avatarPath, ...organizationWithoutPath } = organization;

      const avatarUrl = avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
            resize: mantineAvatarXl2x,
          })
        : null;

      // Member email addresses are admin-only; ordinary members can call this too.
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
            emails: ctx.canAdmin ? userWithoutPath.emails : [],
            avatarUrl: userAvatarUrl,
          },
        };
      });

      return {
        ...organizationWithoutPath,
        avatarUrl,
        memberships: membershipsWithAvatarUrl,
        _count: {
          memberships: organization.memberships.length,
          downstreamOrganizationAssociations:
            downstreamOrganizationAssociationsCount,
        },
        userMembership: ctx.membership,
        unapprovedAssociationsCount,
      };
    },
  ),

  getOrganizationMembers: organizationProcedure.query(
    async ({ ctx, input }) => {
      const organization = await db.query.Organization.findFirst({
        columns: {
          id: true,
          name: true,
          slug: true,
        },
        where: (t, { and, eq }) =>
          and(eq(t.id, input.orgId), eq(t.type, 'MINISTRY')),
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

      if (!organization) {
        moduleLogger.warn('Organization not found for members');

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Sort memberships: isAdmin desc, createdAt asc
      const sortedMemberships = [...organization.memberships].sort((a, b) => {
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
        ...organization,
        memberships: membershipsWithAvatarUrl,
        userMembership: ctx.membership,
        canAdmin: ctx.canAdmin,
      };
    },
  ),

  inviteToOrganization: organizationAdminProcedure
    .input(inviteOrganizationMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          organizationId: input.orgId,
          appUserId: ctx.session.appUserId,
          context: {
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
          },
        },
        'Inviting user to organization',
      );

      // Check if email already belongs to a member
      const userEmail = await db.query.AppUserEmail.findFirst({
        where: (t, { eq }) => eq(t.email, input.email),
        columns: { appUserId: true },
      });

      if (userEmail) {
        const existingMember = await db.query.OrganizationMembership.findFirst({
          where: (t, { and, eq }) =>
            and(
              eq(t.organizationId, input.orgId),
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
            and(eq(t.organizationId, input.orgId), eq(t.email, input.email)),
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
          organizationId: input.orgId,
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
          organizationId: input.orgId,
          appUserId: ctx.session.appUserId,
          context: {
            invitationId: invitation.id,
          },
        },
        'Organization invitation created and email sent',
      );

      // Return identical success message for security (no user enumeration)
      return { success: true, message: 'Invitation sent successfully' };
    }),

  getOrganizationInvitations: organizationAdminProcedure
    .input(organizationQuerySchema)
    .query(async ({ input }) => {
      const invitations = await db.query.OrganizationInvitation.findMany({
        where: (t, { and, eq, gt }) =>
          and(
            eq(t.organizationId, input.orgId),
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

  cancelInvitation: organizationAdminProcedure
    .input(cancelOrganizationInvitationSchema)
    .mutation(async ({ input }) => {
      // Use update with both id and orgId to ensure the invitation belongs to the organization
      const result = await db
        .update(OrganizationInvitation)
        .set({ status: 'CANCELLED' })
        .where(
          and(
            eq(OrganizationInvitation.id, input.invitationId),
            eq(OrganizationInvitation.organizationId, input.orgId),
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

  resendInvitation: organizationAdminProcedure
    .input(resendOrganizationInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      // First fetch and validate the invitation
      const existingInvitation =
        await db.query.OrganizationInvitation.findFirst({
          where: (t, { and, eq }) =>
            and(
              eq(t.id, input.invitationId),
              eq(t.organizationId, input.orgId),
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
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Send invitation email
      await sendInvitationEmail({
        invitationId: invitation.id,
        type: 'organization',
      });

      moduleLogger.info(
        {
          organizationId: input.orgId,
          appUserId: ctx.session.appUserId,
          context: {
            invitationId: invitation.id,
          },
        },
        'Organization invitation resent',
      );

      return { success: true };
    }),

  removeOrganizationMember: organizationAdminProcedure
    .input(removeOrganizationMemberSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          organizationId: input.orgId,
          context: {
            memberToRemove: input.appUserId,
            removedBy: ctx.session.appUserId,
          },
        },
        'Removing organization member',
      );

      try {
        let wasAdmin = false;
        await db.transaction(async (tx) => {
          await tx.execute(sql`
            select ${Organization.id}
            from ${Organization}
            where ${Organization.id} = ${input.orgId}
            for update
          `);

          // Don't allow removing the last admin
          const adminMembers = await tx.query.OrganizationMembership.findMany({
            where: (t, { and, eq }) =>
              and(eq(t.organizationId, input.orgId), eq(t.isAdmin, true)),
            columns: { appUserId: true },
          });
          const adminCount = adminMembers.length;

          const membershipToDelete =
            await tx.query.OrganizationMembership.findFirst({
              where: (t, { and, eq }) =>
                and(
                  eq(t.organizationId, input.orgId),
                  eq(t.appUserId, input.appUserId),
                ),
              columns: { isAdmin: true, appUserId: true },
            });

          if (!membershipToDelete) {
            moduleLogger.warn(
              {
                organizationId: input.orgId,
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
                organizationId: input.orgId,
                context: {
                  memberToRemove: input.appUserId,
                  removedBy: ctx.session.appUserId,
                },
              },
              'Cannot remove last admin from organization',
            );
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot remove the last admin from the organization',
            });
          }

          await tx
            .delete(OrganizationMembership)
            .where(
              and(
                eq(OrganizationMembership.organizationId, input.orgId),
                eq(OrganizationMembership.appUserId, input.appUserId),
              ),
            );
        });

        moduleLogger.info(
          {
            organizationId: input.orgId,
            context: {
              memberRemoved: input.appUserId,
              removedBy: ctx.session.appUserId,
              wasAdmin,
            },
          },
          'Organization member removed successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        moduleLogger.error(
          {
            organizationId: input.orgId,
            context: {
              memberToRemove: input.appUserId,
              removedBy: ctx.session.appUserId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove organization member',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to remove organization member',
        });
      }
    }),

  getOrganizationForEdit: organizationAdminProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching organization for edit',
      );

      const organization = await db.query.Organization.findFirst({
        columns: {
          id: true,
          name: true,
          description: true,
          websiteUrl: true,
          primaryEmail: true,
          primaryPhoneNumber: true,
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
          and(eq(t.id, input.orgId), eq(t.type, 'MINISTRY')),
      });

      if (!organization) {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
          },
          'Organization not found for edit',
        );

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return organization;
    },
  ),

  updateOrganization: organizationAdminProcedure
    .input(updateOrganizationSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            orgId: input.orgId,
          },
        },
        'Updating organization',
      );

      try {
        await db
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
          .where(eq(Organization.id, input.orgId));

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
            },
          },
          'Organization updated successfully',
        );

        return { error: false };
      } catch (e) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
              error: e instanceof Error ? e.message : String(e),
            },
          },
          'Organization update failed',
        );
        return { error: 'Error updating organization, please try again!' };
      }
    }),

  approveOrganization: authProcedure
    .input(organizationQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can approve organizations
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
            context: {
              role: ctx.session.appUser.role,
            },
          },
          'Non-admin user attempted to approve organization',
        );
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            orgId: input.orgId,
          },
        },
        'Approving organization',
      );

      try {
        await db
          .update(Organization)
          .set({
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
            updatedAt: new Date(),
          })
          .where(eq(Organization.id, input.orgId));

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
            },
          },
          'Organization approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve organization',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve organization',
        });
      }
    }),

  unapproveOrganization: authProcedure
    .input(organizationQuerySchema)
    .use(async ({ ctx, next }) => {
      // Only site admins can unapprove organizations
      if (ctx.session.appUser.role !== 'ADMIN') {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
            context: { role: ctx.session.appUser.role },
          },
          'Non-admin user attempted to unapprove organization',
        );
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            orgId: input.orgId,
          },
        },
        'Unapproving organization',
      );

      try {
        await db
          .update(Organization)
          .set({
            approvedAt: null,
            approvedById: null,
            updatedAt: new Date(),
          })
          .where(eq(Organization.id, input.orgId));

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
            },
          },
          'Organization unapproved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              orgId: input.orgId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to unapprove organization',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unapprove organization',
        });
      }
    }),

  getPendingDownstreamApprovals: organizationProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching pending downstream approvals',
      );

      // Get the organization to make sure it's not a church
      const organization = await db.query.Organization.findFirst({
        columns: { id: true, name: true, type: true },
        where: (t, { and, eq }) =>
          and(eq(t.id, input.orgId), eq(t.type, 'MINISTRY')),
      });

      if (!organization) {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
          },
          'Organization not found or is not a ministry',
        );
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Get all pending downstream relationship approvals
      const pendingApprovals =
        await db.query.OrganizationOrganizationAssociation.findMany({
          columns: {
            downstreamOrganizationId: true,
            createdAt: true,
            downstreamApproved: true,
          },
          where: (t, { and, eq }) =>
            and(
              eq(t.upstreamOrganizationId, input.orgId),
              eq(t.upstreamApproved, false),
            ),
          with: {
            downstreamOrganization: {
              columns: {
                id: true,
                name: true,
                type: true,
                slug: true,
                description: true,
                avatarPath: true,
              },
            },
          },
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        });

      return pendingApprovals.map((approval) => {
        const { avatarPath, ...orgWithoutPath } =
          approval.downstreamOrganization;
        const avatarUrl = avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
              resize: mantineAvatarSm2x,
            })
          : null;

        return {
          ...approval,
          downstreamOrganization: {
            ...orgWithoutPath,
            avatarUrl,
          },
        };
      });
    },
  ),

  approveDownstreamRelationship: organizationAdminProcedure
    .input(organizationRelationshipSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Approving downstream relationship',
      );

      try {
        await db
          .update(OrganizationOrganizationAssociation)
          .set({
            upstreamApproved: true,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(
                OrganizationOrganizationAssociation.upstreamOrganizationId,
                input.orgId,
              ),
              eq(
                OrganizationOrganizationAssociation.downstreamOrganizationId,
                input.downstreamOrganizationId,
              ),
            ),
          );

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Downstream relationship approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve downstream relationship',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve downstream relationship',
        });
      }
    }),

  rejectDownstreamRelationship: organizationAdminProcedure
    .input(organizationRelationshipSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Rejecting downstream relationship',
      );

      try {
        const association =
          await db.query.OrganizationOrganizationAssociation.findFirst({
            where: (t, { and, eq }) =>
              and(
                eq(t.upstreamOrganizationId, input.orgId),
                eq(t.downstreamOrganizationId, input.downstreamOrganizationId),
              ),
            columns: { upstreamOrganizationId: true },
          });

        if (!association) {
          moduleLogger.warn(
            {
              appUserId: ctx.session.appUserId,
            },
            'Downstream relationship not found',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Relationship not found',
          });
        }

        await db
          .delete(OrganizationOrganizationAssociation)
          .where(
            and(
              eq(
                OrganizationOrganizationAssociation.upstreamOrganizationId,
                input.orgId,
              ),
              eq(
                OrganizationOrganizationAssociation.downstreamOrganizationId,
                input.downstreamOrganizationId,
              ),
            ),
          );

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Downstream relationship rejected successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to reject downstream relationship',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reject downstream relationship',
        });
      }
    }),

  getUpstreamAssociations: organizationProcedure.query(
    async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching upstream associations',
      );

      // Get all associations where this organization is upstream
      const upstreamAssociations =
        await db.query.OrganizationOrganizationAssociation.findMany({
          columns: {
            downstreamOrganizationId: true,
            upstreamApproved: true,
            downstreamApproved: true,
            createdAt: true,
          },
          where: (t, { eq }) => eq(t.upstreamOrganizationId, input.orgId),
          with: {
            downstreamOrganization: {
              columns: {
                id: true,
                name: true,
                type: true,
                slug: true,
                description: true,
                avatarPath: true,
              },
            },
          },
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        });

      return upstreamAssociations.map((association) => {
        const { avatarPath, ...orgWithoutPath } =
          association.downstreamOrganization;
        const avatarUrl = avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
              resize: mantineAvatarSm2x,
            })
          : null;

        return {
          ...association,
          downstreamOrganization: {
            ...orgWithoutPath,
            avatarUrl,
          },
        };
      });
    },
  ),

  approveUpstreamAssociation: organizationAdminProcedure
    .input(upstreamAssociationActionSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Approving upstream association',
      );

      try {
        await db
          .update(OrganizationOrganizationAssociation)
          .set({
            upstreamApproved: true,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(
                OrganizationOrganizationAssociation.upstreamOrganizationId,
                input.orgId,
              ),
              eq(
                OrganizationOrganizationAssociation.downstreamOrganizationId,
                input.downstreamOrganizationId,
              ),
            ),
          );

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Upstream association approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve upstream association',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve upstream association',
        });
      }
    }),

  unapproveUpstreamAssociation: organizationAdminProcedure
    .input(upstreamAssociationActionSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Unapproving upstream association',
      );

      try {
        await db
          .update(OrganizationOrganizationAssociation)
          .set({
            upstreamApproved: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(
                OrganizationOrganizationAssociation.upstreamOrganizationId,
                input.orgId,
              ),
              eq(
                OrganizationOrganizationAssociation.downstreamOrganizationId,
                input.downstreamOrganizationId,
              ),
            ),
          );

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Upstream association unapproved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to unapprove upstream association',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unapprove upstream association',
        });
      }
    }),

  deleteUpstreamAssociation: organizationAdminProcedure
    .input(upstreamAssociationActionSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Deleting upstream association',
      );

      try {
        const association =
          await db.query.OrganizationOrganizationAssociation.findFirst({
            where: (t, { and, eq }) =>
              and(
                eq(t.upstreamOrganizationId, input.orgId),
                eq(t.downstreamOrganizationId, input.downstreamOrganizationId),
              ),
            columns: { upstreamOrganizationId: true },
          });

        if (!association) {
          moduleLogger.warn(
            {
              appUserId: ctx.session.appUserId,
            },
            'Upstream association not found',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Association not found',
          });
        }

        await db
          .delete(OrganizationOrganizationAssociation)
          .where(
            and(
              eq(
                OrganizationOrganizationAssociation.upstreamOrganizationId,
                input.orgId,
              ),
              eq(
                OrganizationOrganizationAssociation.downstreamOrganizationId,
                input.downstreamOrganizationId,
              ),
            ),
          );

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'Upstream association deleted successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to delete upstream association',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete upstream association',
        });
      }
    }),
});
