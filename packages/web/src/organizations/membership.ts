import {
  db,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
} from '@letschurch/db';
import { and, count, eq, gt, sql } from 'drizzle-orm';

import { sendInvitationEmail } from '@/temporal';
import { uuidTranslator } from '@/util/uuid';

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type OrganizationMembershipErrorCode =
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_NOT_PENDING'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'LAST_ADMIN';

export class OrganizationMembershipError extends Error {
  readonly name = 'OrganizationMembershipError';

  constructor(readonly code: OrganizationMembershipErrorCode) {
    super(code);
  }
}

export type InvitationEmailDispatch =
  | { status: 'STARTED' }
  | { status: 'FAILED'; error: unknown };

export type InviteMemberOutcome =
  | { kind: 'UNCHANGED'; reason: 'EXISTING_MEMBER' | 'ACTIVE_INVITATION' }
  | {
      kind: 'INVITATION_ISSUED';
      invitationId: string;
      emailDispatch: InvitationEmailDispatch;
    };

export type ResendInvitationOutcome = {
  invitationId: string;
  emailDispatch: InvitationEmailDispatch;
};

type InviteMemberInput = {
  organizationId: string;
  actorId: string;
  email: string;
  isAdmin: boolean;
  canEdit: boolean;
};
type OrganizationInput = {
  organizationId: string;
};

type OrganizationInvitationInput = {
  organizationId: string;
  invitationId: string;
};

type RemoveMemberInput = {
  organizationId: string;
  appUserId: string;
};

type Dependencies = {
  now: () => Date;
  sendInvitation: (invitationId: string) => Promise<unknown>;
};

export function createOrganizationMembershipService(
  dependencies: Dependencies,
) {
  async function dispatchInvitationEmail(
    invitationId: string,
  ): Promise<InvitationEmailDispatch> {
    try {
      await dependencies.sendInvitation(invitationId);
      return { status: 'STARTED' };
    } catch (error) {
      return { status: 'FAILED', error };
    }
  }

  return {
    async inviteMember(input: InviteMemberInput): Promise<InviteMemberOutcome> {
      const now = dependencies.now();
      const mutation = await db.transaction(async (tx) => {
        const userEmail = await tx.query.AppUserEmail.findFirst({
          where: (table, { eq }) => eq(table.email, input.email),
          columns: { appUserId: true },
        });

        if (userEmail) {
          const existingMember =
            await tx.query.OrganizationMembership.findFirst({
              where: (table, { and, eq }) =>
                and(
                  eq(table.organizationId, input.organizationId),
                  eq(table.appUserId, userEmail.appUserId),
                ),
              columns: { appUserId: true },
            });

          if (existingMember) {
            return {
              kind: 'UNCHANGED' as const,
              reason: 'EXISTING_MEMBER' as const,
            };
          }
        }

        const existingInvitation =
          await tx.query.OrganizationInvitation.findFirst({
            where: (table, { and, eq }) =>
              and(
                eq(table.organizationId, input.organizationId),
                eq(table.email, input.email),
              ),
            columns: { id: true, status: true, expiresAt: true },
          });

        if (
          existingInvitation?.status === 'PENDING' &&
          existingInvitation.expiresAt > now
        ) {
          return {
            kind: 'UNCHANGED' as const,
            reason: 'ACTIVE_INVITATION' as const,
          };
        }

        const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
        const [invitation] = await tx
          .insert(OrganizationInvitation)
          .values({
            organizationId: input.organizationId,
            email: input.email,
            isAdmin: input.isAdmin,
            canEdit: input.canEdit,
            invitedById: input.actorId,
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
              invitedById: input.actorId,
              expiresAt,
              respondedAt: null,
            },
          })
          .returning({ id: OrganizationInvitation.id });

        if (!invitation) {
          throw new Error('Organization invitation upsert returned no row');
        }

        return {
          kind: 'INVITATION_ISSUED' as const,
          invitationId: invitation.id,
        };
      });

      if (mutation.kind === 'UNCHANGED') return mutation;

      return {
        ...mutation,
        emailDispatch: await dispatchInvitationEmail(mutation.invitationId),
      };
    },

    async listInvitations(input: OrganizationInput) {
      const now = dependencies.now();
      const invitations = await db.query.OrganizationInvitation.findMany({
        where: (table, { and, eq }) =>
          and(
            eq(table.organizationId, input.organizationId),
            eq(table.status, 'PENDING'),
            gt(table.expiresAt, now),
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
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      });

      return invitations.map(({ token, ...invitation }) => ({
        ...invitation,
        token: uuidTranslator.fromUUID(token),
      }));
    },

    async cancelInvitation(input: OrganizationInvitationInput) {
      const [invitation] = await db
        .update(OrganizationInvitation)
        .set({ status: 'CANCELLED' })
        .where(
          and(
            eq(OrganizationInvitation.id, input.invitationId),
            eq(OrganizationInvitation.organizationId, input.organizationId),
          ),
        )
        .returning({ id: OrganizationInvitation.id });

      if (!invitation) {
        throw new OrganizationMembershipError('INVITATION_NOT_FOUND');
      }
    },

    async resendInvitation(
      input: OrganizationInvitationInput,
    ): Promise<ResendInvitationOutcome> {
      const now = dependencies.now();
      const existingInvitation =
        await db.query.OrganizationInvitation.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.id, input.invitationId),
              eq(table.organizationId, input.organizationId),
            ),
          columns: { id: true, status: true },
        });

      if (!existingInvitation) {
        throw new OrganizationMembershipError('INVITATION_NOT_FOUND');
      }
      if (existingInvitation.status !== 'PENDING') {
        throw new OrganizationMembershipError('INVITATION_NOT_PENDING');
      }

      const [invitation] = await db
        .update(OrganizationInvitation)
        .set({
          expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
        })
        .where(
          and(
            eq(OrganizationInvitation.id, input.invitationId),
            eq(OrganizationInvitation.organizationId, input.organizationId),
            eq(OrganizationInvitation.status, 'PENDING'),
          ),
        )
        .returning({ id: OrganizationInvitation.id });

      if (!invitation) {
        throw new OrganizationMembershipError('INVITATION_NOT_PENDING');
      }

      return {
        invitationId: invitation.id,
        emailDispatch: await dispatchInvitationEmail(invitation.id),
      };
    },

    async removeMember(input: RemoveMemberInput) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`
          select ${Organization.id}
          from ${Organization}
          where ${Organization.id} = ${input.organizationId}
          for update
        `);

        const [adminTotal] = await tx
          .select({ value: count() })
          .from(OrganizationMembership)
          .where(
            and(
              eq(OrganizationMembership.organizationId, input.organizationId),
              eq(OrganizationMembership.isAdmin, true),
            ),
          );

        const membership = await tx.query.OrganizationMembership.findFirst({
          where: (table, { and, eq }) =>
            and(
              eq(table.organizationId, input.organizationId),
              eq(table.appUserId, input.appUserId),
            ),
          columns: { isAdmin: true },
        });

        if (!membership) {
          throw new OrganizationMembershipError('MEMBERSHIP_NOT_FOUND');
        }
        if (membership.isAdmin && (adminTotal?.value ?? 0) <= 1) {
          throw new OrganizationMembershipError('LAST_ADMIN');
        }

        const [deletedMembership] = await tx
          .delete(OrganizationMembership)
          .where(
            and(
              eq(OrganizationMembership.organizationId, input.organizationId),
              eq(OrganizationMembership.appUserId, input.appUserId),
            ),
          )
          .returning({ appUserId: OrganizationMembership.appUserId });

        if (!deletedMembership) {
          throw new OrganizationMembershipError('MEMBERSHIP_NOT_FOUND');
        }

        return { wasAdmin: membership.isAdmin };
      });
    },
  };
}

export const organizationMembership = createOrganizationMembershipService({
  now: () => new Date(),
  sendInvitation: (invitationId) =>
    sendInvitationEmail({ invitationId, type: 'organization' }),
});
