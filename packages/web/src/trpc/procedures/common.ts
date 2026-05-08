import {
  ChannelInvitation,
  ChannelMembership,
  db,
  OrganizationInvitation,
  OrganizationMembership,
} from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import {
  getInvitationDetailsSchema,
  respondToChannelInvitationSchema,
  respondToOrganizationInvitationSchema,
} from '@/schemas/dashboard';
import { sendVerificationEmail } from '@/temporal';
import logger from '@/util/logger';
import { uuidTranslator } from '@/util/uuid';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/common',
});

const clientEnv = z
  .object({
    TURNSTILE_SITE_KEY: z.string(),
    MAPBOX_MAP_TOKEN: z.string(),
    MAPBOX_SEARCHBOX_TOKEN: z.string(),
  })
  .parse(process.env);

export const commonProcedures = {
  hasValidSession: publicProcedure.query(async ({ ctx }): Promise<boolean> => {
    const hasSession = Boolean(ctx.session);

    moduleLogger.info(
      { context: { hasSession, sessionId: ctx.session?.id } },
      'Session validation check',
    );

    return hasSession;
  }),

  getCurrentUser: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
        context: { role: ctx.session.appUser.role },
      },
      'Current user info requested',
    );

    return {
      id: ctx.session.appUser.id,
      role: ctx.session.appUser.role,
    };
  }),

  getClientEnv: publicProcedure.query(() => {
    moduleLogger.info('Client environment requested');
    return clientEnv;
  }),

  lookupSlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const { slug } = input;

      moduleLogger.info({ context: { slug } }, 'Looking up slug');

      // Try to parse as an ID first
      const idResult = IncomingIdSchema.safeParse(slug);

      if (idResult.success) {
        // Check if this is a valid upload ID
        const upload = await db.query.UploadRecord.findFirst({
          where: (t, { eq }) => eq(t.id, idResult.data),
          columns: { id: true },
        });

        if (upload) {
          const outgoingId = OutgoingIdSchema.parse(idResult.data);

          moduleLogger.info(
            { uploadId: outgoingId, context: { slug } },
            'Slug resolved to media upload',
          );

          return { type: 'media' as const, id: outgoingId };
        }

        moduleLogger.info(
          { context: { slug, parsedId: idResult.data } },
          'Slug parsed as ID but upload not found',
        );
      }

      // Try to find a channel with this slug
      const channel = await db.query.Channel.findFirst({
        where: (t, { eq, and, isNull }) =>
          and(eq(t.slug, slug), isNull(t.deletedAt)),
        columns: {
          slug: true,
          visibility: true,
          approvedAt: true,
          deletedAt: true,
        },
      });

      if (
        channel &&
        channel.visibility === 'PUBLIC' &&
        channel.approvedAt &&
        !channel.deletedAt
      ) {
        moduleLogger.info(
          {
            context: {
              slug,
              visibility: channel.visibility,
              approved: Boolean(channel.approvedAt),
            },
          },
          'Slug resolved to channel',
        );

        return { type: 'channel' as const, slug };
      }

      if (channel) {
        moduleLogger.info(
          {
            context: {
              slug,
              visibility: channel.visibility,
              approved: Boolean(channel.approvedAt),
            },
          },
          'Channel found but not accessible',
        );
      } else {
        moduleLogger.info({ context: { slug } }, 'Slug not found');
      }

      return { type: 'not-found' as const };
    }),

  getInvitationDetails: publicProcedure
    .input(getInvitationDetailsSchema)
    .query(async ({ input }) => {
      const { token } = input;

      moduleLogger.info({ context: { token } }, 'Getting invitation details');

      // Try organization invitation first
      const orgInvitation = await db.query.OrganizationInvitation.findFirst({
        where: (t, { eq }) => eq(t.token, token),
        columns: {
          id: true,
          email: true,
          status: true,
          expiresAt: true,
          isAdmin: true,
          canEdit: true,
        },
        with: {
          organization: {
            columns: {
              id: true,
              name: true,
              type: true,
              avatarPath: true,
            },
          },
        },
      });

      if (orgInvitation) {
        // Don't return sensitive info for non-pending invitations
        if (orgInvitation.status !== 'PENDING') {
          moduleLogger.info(
            {
              context: {
                token,
                status: orgInvitation.status,
              },
            },
            'Organization invitation is not pending',
          );
          return {
            status: orgInvitation.status,
            type: 'organization' as const,
          };
        }

        // Check if invitation has expired
        if (orgInvitation.expiresAt < new Date()) {
          moduleLogger.info(
            {
              context: {
                token,
                expiresAt: orgInvitation.expiresAt,
              },
            },
            'Organization invitation has expired',
          );
          return {
            status: 'EXPIRED' as const,
            type: 'organization' as const,
          };
        }

        moduleLogger.info(
          {
            organizationId: orgInvitation.organization.id,
            context: {
              invitationId: orgInvitation.id,
            },
          },
          'Organization invitation details retrieved',
        );

        return { ...orgInvitation, type: 'organization' as const };
      }

      // Try channel invitation
      const channelInvitation = await db.query.ChannelInvitation.findFirst({
        where: (t, { eq }) => eq(t.token, token),
        columns: {
          id: true,
          email: true,
          status: true,
          expiresAt: true,
          isAdmin: true,
          canEdit: true,
          canUpload: true,
          canDownload: true,
        },
        with: {
          channel: {
            columns: {
              id: true,
              name: true,
              slug: true,
              avatarPath: true,
            },
          },
        },
      });

      if (!channelInvitation) {
        moduleLogger.info(
          { context: { token } },
          'Invitation not found for token',
        );
        return null;
      }

      // Don't return sensitive info for non-pending invitations
      if (channelInvitation.status !== 'PENDING') {
        moduleLogger.info(
          {
            context: {
              token,
              status: channelInvitation.status,
            },
          },
          'Channel invitation is not pending',
        );
        return { status: channelInvitation.status, type: 'channel' as const };
      }

      // Check if invitation has expired
      if (channelInvitation.expiresAt < new Date()) {
        moduleLogger.info(
          {
            context: {
              token,
              expiresAt: channelInvitation.expiresAt,
            },
          },
          'Channel invitation has expired',
        );
        return {
          status: 'EXPIRED' as const,
          type: 'channel' as const,
        };
      }

      moduleLogger.info(
        {
          channelId: channelInvitation.channel.id,
          context: {
            invitationId: channelInvitation.id,
          },
        },
        'Channel invitation details retrieved',
      );

      return { ...channelInvitation, type: 'channel' as const };
    }),

  getPendingInvitations: authProcedure.query(async ({ ctx }) => {
    // Get all verified email addresses for the current user
    const userEmails = await db.query.AppUserEmail.findMany({
      where: (t, { eq, and, isNotNull }) =>
        and(eq(t.appUserId, ctx.session.appUserId), isNotNull(t.verifiedAt)),
      columns: { email: true },
    });

    const emails = userEmails.map((e) => e.email);

    if (emails.length === 0) {
      return [];
    }

    const [orgInvitations, channelInvitations] = await Promise.all([
      db.query.OrganizationInvitation.findMany({
        where: (t, { inArray, eq, and, gt }) =>
          and(
            inArray(t.email, emails),
            eq(t.status, 'PENDING'),
            gt(t.expiresAt, new Date()),
          ),
        columns: {
          id: true,
          token: true,
          email: true,
          createdAt: true,
        },
        with: {
          organization: {
            columns: {
              name: true,
              type: true,
            },
          },
        },
        orderBy: (t, { asc }) => asc(t.createdAt),
      }),
      db.query.ChannelInvitation.findMany({
        where: (t, { inArray, eq, and, gt }) =>
          and(
            inArray(t.email, emails),
            eq(t.status, 'PENDING'),
            gt(t.expiresAt, new Date()),
          ),
        columns: {
          id: true,
          token: true,
          email: true,
          createdAt: true,
        },
        with: {
          channel: {
            columns: {
              name: true,
            },
          },
        },
        orderBy: (t, { asc }) => asc(t.createdAt),
      }),
    ]);

    // Combine and return
    return [
      ...orgInvitations.map((inv) => ({
        type: 'organization' as const,
        token: uuidTranslator.fromUUID(inv.token),
        name: inv.organization.name,
        createdAt: inv.createdAt,
      })),
      ...channelInvitations.map((inv) => ({
        type: 'channel' as const,
        token: uuidTranslator.fromUUID(inv.token),
        name: inv.channel.name,
        createdAt: inv.createdAt,
      })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }),

  getUnverifiedEmail: authProcedure.query(async ({ ctx }) => {
    // Get the user's primary email (first email)
    const userEmail = await db.query.AppUserEmail.findFirst({
      where: (t, { eq }) => eq(t.appUserId, ctx.session.appUserId),
      columns: {
        email: true,
        verifiedAt: true,
      },
      orderBy: (t, { asc }) => asc(t.id),
    });

    if (!userEmail) {
      return null;
    }

    // Return null if email is verified
    if (userEmail.verifiedAt) {
      return null;
    }

    return {
      email: userEmail.email,
    };
  }),

  resendVerificationEmail: authProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Resend verification email requested',
    );

    // Get the user's primary unverified email
    const userEmail = await db.query.AppUserEmail.findFirst({
      where: (t, { eq, and, isNull }) =>
        and(eq(t.appUserId, ctx.session.appUserId), isNull(t.verifiedAt)),
      columns: {
        email: true,
      },
      orderBy: (t, { asc }) => asc(t.id),
    });

    if (!userEmail) {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'No unverified email found for resend request',
      );
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No unverified email found',
      });
    }

    // Get the user's username for the email
    const user = await db.query.AppUser.findFirst({
      where: (t, { eq }) => eq(t.id, ctx.session.appUserId),
      columns: { username: true },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    // Send the verification email
    await sendVerificationEmail({
      userId: ctx.session.appUserId,
      username: user.username,
      email: userEmail.email,
    });

    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
        context: {
          email: userEmail.email,
        },
      },
      'Verification email resent successfully',
    );

    return { success: true };
  }),

  acceptOrganizationInvitation: publicProcedure
    .input(respondToOrganizationInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      const { token, accept } = input;

      moduleLogger.info(
        {
          context: {
            token,
            accept,
            hasSession: Boolean(ctx.session),
          },
        },
        'Processing invitation response',
      );

      const invitation = await db.query.OrganizationInvitation.findFirst({
        where: (t, { eq }) => eq(t.token, token),
        with: {
          organization: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      if (invitation.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invitation already processed',
        });
      }

      if (invitation.expiresAt < new Date()) {
        await db
          .update(OrganizationInvitation)
          .set({ status: 'EXPIRED' })
          .where(eq(OrganizationInvitation.id, invitation.id));

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invitation has expired',
        });
      }

      if (!accept) {
        await db
          .update(OrganizationInvitation)
          .set({
            status: 'DECLINED',
            respondedAt: new Date(),
          })
          .where(eq(OrganizationInvitation.id, invitation.id));

        moduleLogger.info(
          {
            organizationId: invitation.organization.id,
            context: {
              invitationId: invitation.id,
            },
          },
          'Invitation declined',
        );

        return { success: true, declined: true };
      }

      // User must be authenticated to accept
      if (!ctx.session) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to accept invitations',
        });
      }

      const appUserId = ctx.session.appUserId;

      // Verify user's email matches invitation
      const userEmail = await db.query.AppUserEmail.findFirst({
        where: (t, { eq, and, isNotNull }) =>
          and(
            eq(t.appUserId, appUserId),
            eq(t.email, invitation.email),
            isNotNull(t.verifiedAt),
          ),
      });

      if (!userEmail) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must verify the invited email address first',
        });
      }

      // Check if user is already a member
      const existingMember = await db.query.OrganizationMembership.findFirst({
        where: (t, { eq, and }) =>
          and(
            eq(t.organizationId, invitation.organization.id),
            eq(t.appUserId, appUserId),
          ),
      });

      if (existingMember) {
        // User is already a member, just mark invitation as accepted
        await db
          .update(OrganizationInvitation)
          .set({
            status: 'ACCEPTED',
            respondedAt: new Date(),
          })
          .where(eq(OrganizationInvitation.id, invitation.id));

        moduleLogger.info(
          {
            organizationId: invitation.organization.id,
            appUserId: ctx.session.appUserId,
            context: {
              invitationId: invitation.id,
            },
          },
          'User already member, invitation marked as accepted',
        );

        return {
          success: true,
          organizationId: invitation.organization.id,
          alreadyMember: true,
        };
      }

      // Create membership and mark invitation accepted
      await db.transaction(async (tx) => {
        await tx.insert(OrganizationMembership).values({
          organizationId: invitation.organization.id,
          appUserId,
          isAdmin: invitation.isAdmin,
          canEdit: invitation.canEdit,
          updatedAt: new Date(),
        });
        await tx
          .update(OrganizationInvitation)
          .set({
            status: 'ACCEPTED',
            respondedAt: new Date(),
          })
          .where(eq(OrganizationInvitation.id, invitation.id));
      });

      moduleLogger.info(
        {
          organizationId: invitation.organization.id,
          appUserId: ctx.session.appUserId,
          context: {
            invitationId: invitation.id,
          },
        },
        'Invitation accepted and membership created',
      );

      return {
        success: true,
        organizationId: invitation.organization.id,
      };
    }),

  acceptChannelInvitation: publicProcedure
    .input(respondToChannelInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      const { token, accept } = input;

      moduleLogger.info(
        {
          context: {
            token,
            accept,
            hasSession: Boolean(ctx.session),
          },
        },
        'Processing channel invitation response',
      );

      const invitation = await db.query.ChannelInvitation.findFirst({
        where: (t, { eq }) => eq(t.token, token),
        with: {
          channel: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found',
        });
      }

      if (invitation.status !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invitation already processed',
        });
      }

      if (invitation.expiresAt < new Date()) {
        await db
          .update(ChannelInvitation)
          .set({ status: 'EXPIRED' })
          .where(eq(ChannelInvitation.id, invitation.id));

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invitation has expired',
        });
      }

      if (!accept) {
        await db
          .update(ChannelInvitation)
          .set({
            status: 'DECLINED',
            respondedAt: new Date(),
          })
          .where(eq(ChannelInvitation.id, invitation.id));

        moduleLogger.info(
          {
            channelId: invitation.channel.id,
            context: {
              invitationId: invitation.id,
            },
          },
          'Channel invitation declined',
        );

        return { success: true, declined: true };
      }

      // User must be authenticated to accept
      if (!ctx.session) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to accept invitations',
        });
      }

      const appUserId = ctx.session.appUserId;

      // Verify user's email matches invitation
      const userEmail = await db.query.AppUserEmail.findFirst({
        where: (t, { eq, and, isNotNull }) =>
          and(
            eq(t.appUserId, appUserId),
            eq(t.email, invitation.email),
            isNotNull(t.verifiedAt),
          ),
      });

      if (!userEmail) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You must verify the invited email address first',
        });
      }

      // Check if user is already a member
      const existingMember = await db.query.ChannelMembership.findFirst({
        where: (t, { eq, and }) =>
          and(
            eq(t.channelId, invitation.channel.id),
            eq(t.appUserId, appUserId),
          ),
      });

      if (existingMember) {
        // User is already a member, just mark invitation as accepted
        await db
          .update(ChannelInvitation)
          .set({
            status: 'ACCEPTED',
            respondedAt: new Date(),
          })
          .where(eq(ChannelInvitation.id, invitation.id));

        moduleLogger.info(
          {
            channelId: invitation.channel.id,
            appUserId: ctx.session.appUserId,
            context: {
              invitationId: invitation.id,
            },
          },
          'User already member, channel invitation marked as accepted',
        );

        return {
          success: true,
          channelId: invitation.channel.id,
          alreadyMember: true,
        };
      }

      // Create membership and mark invitation accepted
      await db.transaction(async (tx) => {
        await tx.insert(ChannelMembership).values({
          channelId: invitation.channel.id,
          appUserId,
          isAdmin: invitation.isAdmin,
          canEdit: invitation.canEdit,
          canUpload: invitation.canUpload,
          canDownload: invitation.canDownload,
          updatedAt: new Date(),
        });
        await tx
          .update(ChannelInvitation)
          .set({
            status: 'ACCEPTED',
            respondedAt: new Date(),
          })
          .where(eq(ChannelInvitation.id, invitation.id));
      });

      moduleLogger.info(
        {
          channelId: invitation.channel.id,
          appUserId: ctx.session.appUserId,
          context: {
            invitationId: invitation.id,
          },
        },
        'Channel invitation accepted and membership created',
      );

      return {
        success: true,
        channelId: invitation.channel.id,
      };
    }),
};
