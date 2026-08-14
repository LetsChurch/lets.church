import {
  ChannelInvitation,
  ChannelMembership,
  db,
  OrganizationInvitation,
  OrganizationMembership,
} from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import { and, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';

import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import {
  getInvitationDetailsSchema,
  respondToChannelInvitationSchema,
  respondToOrganizationInvitationSchema,
} from '@/schemas/dashboard';
import { sendVerificationEmail } from '@/temporal';
import logger from '@/util/logger';
import { getMaintenanceConfig } from '@/util/maintenance';
import { uuidTranslator } from '@/util/uuid';

import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/common',
});
type InvitationResponseError = 'ALREADY_PROCESSED' | 'EXPIRED' | 'NOT_FOUND';

function throwInvitationResponseError(error: InvitationResponseError): never {
  switch (error) {
    case 'NOT_FOUND':
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Invitation not found',
      });
    case 'EXPIRED':
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invitation has expired',
      });
    case 'ALREADY_PROCESSED':
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invitation already processed',
      });
  }
}

const clientEnv = z
  .object({
    HCAPTCHA_SITE_KEY: z.string(),
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

  // Public: drives both the root-route redirect and the /maintenance page.
  // `isAdmin` lets the client decide whether the current viewer is exempt
  // without a second (auth-only) round trip.
  getMaintenanceStatus: publicProcedure.query(async ({ ctx }) => {
    const config = await getMaintenanceConfig();

    return {
      enabled: config.maintenanceMode,
      message: config.maintenanceMessage,
      isAdmin: ctx.isSiteAdmin,
    };
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

      // Don't log the raw invitation token: it is a bearer credential that
      // grants access to invitation details and the decline action.
      moduleLogger.info('Getting invitation details');

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
                invitationId: orgInvitation.id,
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
                invitationId: orgInvitation.id,
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
        moduleLogger.info('Invitation not found for token');
        return null;
      }

      // Don't return sensitive info for non-pending invitations
      if (channelInvitation.status !== 'PENDING') {
        moduleLogger.info(
          {
            context: {
              invitationId: channelInvitation.id,
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
              invitationId: channelInvitation.id,
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
            // The raw token is a bearer credential — never log it.
            accept,
            hasSession: Boolean(ctx.session),
          },
        },
        'Processing invitation response',
      );

      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const [invitation] = await tx
          .update(OrganizationInvitation)
          .set({
            status: accept ? 'ACCEPTED' : 'DECLINED',
            respondedAt: now,
          })
          .where(
            and(
              eq(OrganizationInvitation.token, token),
              eq(OrganizationInvitation.status, 'PENDING'),
              gte(OrganizationInvitation.expiresAt, now),
            ),
          )
          .returning();

        if (!invitation) {
          const [expiredInvitation] = await tx
            .update(OrganizationInvitation)
            .set({ status: 'EXPIRED' })
            .where(
              and(
                eq(OrganizationInvitation.token, token),
                eq(OrganizationInvitation.status, 'PENDING'),
                lt(OrganizationInvitation.expiresAt, now),
              ),
            )
            .returning({ id: OrganizationInvitation.id });

          if (expiredInvitation) {
            return { error: 'EXPIRED' as const, outcome: 'ERROR' as const };
          }

          const [currentInvitation] = await tx
            .select({ status: OrganizationInvitation.status })
            .from(OrganizationInvitation)
            .where(eq(OrganizationInvitation.token, token))
            .limit(1);

          return {
            error: currentInvitation
              ? ('ALREADY_PROCESSED' as const)
              : ('NOT_FOUND' as const),
            outcome: 'ERROR' as const,
          };
        }

        if (!accept) {
          return { invitation, outcome: 'DECLINED' as const };
        }

        if (!ctx.session) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to accept invitations',
          });
        }

        const appUserId = ctx.session.appUserId;
        const userEmail = await tx.query.AppUserEmail.findFirst({
          where: (table, { eq, and, isNotNull }) =>
            and(
              eq(table.appUserId, appUserId),
              eq(table.email, invitation.email),
              isNotNull(table.verifiedAt),
            ),
        });

        if (!userEmail) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You must verify the invited email address first',
          });
        }

        const existingMember = await tx.query.OrganizationMembership.findFirst({
          where: (table, { eq, and }) =>
            and(
              eq(table.organizationId, invitation.organizationId),
              eq(table.appUserId, appUserId),
            ),
        });

        if (!existingMember) {
          await tx.insert(OrganizationMembership).values({
            organizationId: invitation.organizationId,
            appUserId,
            isAdmin: invitation.isAdmin,
            canEdit: invitation.canEdit,
            updatedAt: now,
          });
        }

        return {
          alreadyMember: Boolean(existingMember),
          invitation,
          outcome: 'ACCEPTED' as const,
        };
      });

      if (result.outcome === 'ERROR') {
        throwInvitationResponseError(result.error);
      }

      if (result.outcome === 'DECLINED') {
        moduleLogger.info(
          {
            organizationId: result.invitation.organizationId,
            context: {
              invitationId: result.invitation.id,
            },
          },
          'Invitation declined',
        );

        return { success: true, declined: true };
      }

      moduleLogger.info(
        {
          organizationId: result.invitation.organizationId,
          appUserId: ctx.session!.appUserId,
          context: {
            invitationId: result.invitation.id,
          },
        },
        result.alreadyMember
          ? 'User already member, invitation marked as accepted'
          : 'Invitation accepted and membership created',
      );

      return {
        success: true,
        organizationId: result.invitation.organizationId,
        ...(result.alreadyMember ? { alreadyMember: true } : {}),
      };
    }),

  acceptChannelInvitation: publicProcedure
    .input(respondToChannelInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      const { token, accept } = input;

      moduleLogger.info(
        {
          context: {
            // The raw token is a bearer credential — never log it.
            accept,
            hasSession: Boolean(ctx.session),
          },
        },
        'Processing channel invitation response',
      );

      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const [invitation] = await tx
          .update(ChannelInvitation)
          .set({
            status: accept ? 'ACCEPTED' : 'DECLINED',
            respondedAt: now,
          })
          .where(
            and(
              eq(ChannelInvitation.token, token),
              eq(ChannelInvitation.status, 'PENDING'),
              gte(ChannelInvitation.expiresAt, now),
            ),
          )
          .returning();

        if (!invitation) {
          const [expiredInvitation] = await tx
            .update(ChannelInvitation)
            .set({ status: 'EXPIRED' })
            .where(
              and(
                eq(ChannelInvitation.token, token),
                eq(ChannelInvitation.status, 'PENDING'),
                lt(ChannelInvitation.expiresAt, now),
              ),
            )
            .returning({ id: ChannelInvitation.id });

          if (expiredInvitation) {
            return { error: 'EXPIRED' as const, outcome: 'ERROR' as const };
          }

          const [currentInvitation] = await tx
            .select({ status: ChannelInvitation.status })
            .from(ChannelInvitation)
            .where(eq(ChannelInvitation.token, token))
            .limit(1);

          return {
            error: currentInvitation
              ? ('ALREADY_PROCESSED' as const)
              : ('NOT_FOUND' as const),
            outcome: 'ERROR' as const,
          };
        }

        if (!accept) {
          return { invitation, outcome: 'DECLINED' as const };
        }

        if (!ctx.session) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to accept invitations',
          });
        }

        const appUserId = ctx.session.appUserId;
        const userEmail = await tx.query.AppUserEmail.findFirst({
          where: (table, { eq, and, isNotNull }) =>
            and(
              eq(table.appUserId, appUserId),
              eq(table.email, invitation.email),
              isNotNull(table.verifiedAt),
            ),
        });

        if (!userEmail) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You must verify the invited email address first',
          });
        }

        const existingMember = await tx.query.ChannelMembership.findFirst({
          where: (table, { eq, and }) =>
            and(
              eq(table.channelId, invitation.channelId),
              eq(table.appUserId, appUserId),
            ),
        });

        if (!existingMember) {
          await tx.insert(ChannelMembership).values({
            channelId: invitation.channelId,
            appUserId,
            isAdmin: invitation.isAdmin,
            canEdit: invitation.canEdit,
            canUpload: invitation.canUpload,
            canDownload: invitation.canDownload,
            updatedAt: now,
          });
        }

        return {
          alreadyMember: Boolean(existingMember),
          invitation,
          outcome: 'ACCEPTED' as const,
        };
      });

      if (result.outcome === 'ERROR') {
        throwInvitationResponseError(result.error);
      }

      if (result.outcome === 'DECLINED') {
        moduleLogger.info(
          {
            channelId: result.invitation.channelId,
            context: {
              invitationId: result.invitation.id,
            },
          },
          'Channel invitation declined',
        );

        return { success: true, declined: true };
      }

      moduleLogger.info(
        {
          channelId: result.invitation.channelId,
          appUserId: ctx.session!.appUserId,
          context: {
            invitationId: result.invitation.id,
          },
        },
        result.alreadyMember
          ? 'User already member, channel invitation marked as accepted'
          : 'Channel invitation accepted and membership created',
      );

      return {
        success: true,
        channelId: result.invitation.channelId,
        ...(result.alreadyMember ? { alreadyMember: true } : {}),
      };
    }),
};
