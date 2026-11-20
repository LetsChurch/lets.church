import { randomUUID } from 'node:crypto';

import { AppUser, AppUserPendingEmail, db } from '@letschurch/db';
import { PART_SIZE } from '@letschurch/s3';
import { BACKGROUND_QUEUE } from '@letschurch/temporal/queues';
import { staticMeta } from '@letschurch/temporal/util/dashboard-links';
import { getRequest } from '@tanstack/react-start/server';
import { TRPCError } from '@trpc/server';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { z } from 'zod';

import { passwordChangeSchema, profileUpdateSchema } from '@/schemas/account';
import {
  finalizeMultipartUploadSchema,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  completeMultipartMediaUpload,
  handleMultipartMediaUpload,
  startBackground,
} from '@/temporal';
import { normalizeAuthEmail } from '@/util/auth-token';
import { mantineAvatarLg2x } from '@/util/avatar-sizes';
import { sendEmailChangeNotice } from '@/util/email-change-notice';
import logger from '@/util/logger';
import { hasAcceptedParticipationAgreements } from '@/util/participation';
import { isPendingEmailExpired } from '@/util/pending-email';
import {
  enforcePublicActionRateLimit,
  PUBLIC_ACTION_RATE_LIMIT_MESSAGE,
} from '@/util/public-action-rate-limit';
import { imageUrl } from '@/util/server-env';
import { placeImageUpload } from '@/util/storage';
import testPassword from '@/util/zxcvbn';

import { authProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/account',
});

type ProfileUpdateResponse =
  | {
      error: false;
      /** Set when the new address waits for its confirmation link. */
      pendingEmail: string | null;
    }
  | { error: string };
type PasswordChangeResponse = { error: false } | { error: string };

export const accountProcedures = {
  getParticipationStatus: authProcedure.query(({ ctx }) => ({
    statementOfTheologyAccepted: Boolean(
      ctx.session.appUser.statementOfTheologyAcceptedAt,
    ),
    termsAccepted: Boolean(ctx.session.appUser.termsAcceptedAt),
    accepted: hasAcceptedParticipationAgreements(ctx.session.appUser),
  })),

  acceptParticipationAgreements: authProcedure
    .input(
      z.object({
        statementOfTheology: z.literal(true),
        terms: z.literal(true),
      }),
    )
    .mutation(async ({ ctx }) => {
      const acceptedAt = new Date();
      await db
        .update(AppUser)
        .set({
          statementOfTheologyAcceptedAt: acceptedAt,
          termsAcceptedAt: acceptedAt,
          updatedAt: acceptedAt,
        })
        .where(eq(AppUser.id, ctx.session.appUserId));

      return { accepted: true as const };
    }),

  getSecurity: authProcedure.query(async ({ ctx }) => {
    const user = await db.query.AppUser.findFirst({
      where: (table, { eq }) => eq(table.id, ctx.session.appUserId),
      columns: { password: true },
    });
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return { hasPassword: Boolean(user.password) };
  }),

  getProfile: authProcedure.query(async ({ ctx }) => {
    const user = await db.query.AppUser.findFirst({
      where: (t, { eq }) => eq(t.id, ctx.session.appUserId),
      columns: {
        id: true,
        username: true,
        fullName: true,
        avatarPath: true,
        avatarLocation: true,
      },
      with: {
        emails: {
          columns: {
            email: true,
          },
        },
      },
    });

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const pending = await db.query.AppUserPendingEmail.findFirst({
      where: (t, { eq }) => eq(t.appUserId, ctx.session.appUserId),
      columns: { email: true, createdAt: true },
    });

    const primaryEmail = user.emails[0]?.email || '';
    const avatarUrl = imageUrl(user.avatarLocation, user.avatarPath, {
      resize: mantineAvatarLg2x,
    });

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName || '',
      email: primaryEmail,
      pendingEmail:
        pending && !isPendingEmailExpired(pending.createdAt)
          ? pending.email
          : null,
      avatarUrl,
    };
  }),

  updateProfile: authProcedure
    .input(profileUpdateSchema)
    .mutation(async ({ ctx, input }): Promise<ProfileUpdateResponse> => {
      moduleLogger.info(
        {
          context: {
            userId: ctx.session.appUserId,
            username: input.username,
          },
        },
        'Profile update attempt',
      );

      try {
        const email = normalizeAuthEmail(input.email);
        const existingUser = await db.query.AppUser.findFirst({
          where: (t, { eq, ne, and }) =>
            and(
              eq(t.username, input.username),
              ne(t.id, ctx.session.appUserId),
            ),
        });

        if (existingUser) {
          moduleLogger.warn(
            {
              context: {
                userId: ctx.session.appUserId,
                username: input.username,
              },
            },
            'Profile update failed - username taken',
          );
          return { error: 'Username is already taken' };
        }

        // Whether another account already uses the address is deliberately
        // not checked here: answering "taken" would let any signed-in user
        // test which addresses are registered. Every change waits for the
        // new inbox to confirm, and the confirmation step (which only that
        // inbox's owner reaches) refuses an address another account holds.

        const heldEmail = await db.query.AppUserEmail.findFirst({
          where: (t, { eq }) => eq(t.appUserId, ctx.session.appUserId),
          columns: { email: true },
        });
        if (!heldEmail || normalizeAuthEmail(heldEmail.email) !== email) {
          const rateLimit = await enforcePublicActionRateLimit({
            headers: getRequest().headers,
            email,
            kind: 'email-change',
          });
          if (!rateLimit.allowed) {
            moduleLogger.warn(
              {
                context: {
                  userId: ctx.session.appUserId,
                  limitedBy: rateLimit.limitedBy,
                },
              },
              'Profile update failed - email change rate limited',
            );
            return { error: PUBLIC_ACTION_RATE_LIMIT_MESSAGE };
          }
        }

        const emailChange = await db.transaction(async (tx) => {
          await tx
            .update(AppUser)
            .set({
              username: input.username,
              fullName: input.fullName,
              updatedAt: new Date(),
            })
            .where(eq(AppUser.id, ctx.session.appUserId));

          const currentEmail = await tx.query.AppUserEmail.findFirst({
            where: (t, { eq }) => eq(t.appUserId, ctx.session.appUserId),
          });

          if (
            currentEmail &&
            normalizeAuthEmail(currentEmail.email) === email
          ) {
            // Saving the current address again cancels any pending change.
            await tx
              .delete(AppUserPendingEmail)
              .where(eq(AppUserPendingEmail.appUserId, ctx.session.appUserId));
            return null;
          }

          // Keep the current address until the new inbox confirms. If the
          // new address is mistyped, isn't the user's, or belongs to another
          // account, it never joins this one: its owner can't sign in to the
          // account by email, and the user keeps signing in and recovering
          // through the address they have. Every change takes this path, so
          // the response is the same whether or not the address is free. A
          // new request replaces any older one, with a fresh key so earlier
          // links stop working.
          await tx
            .insert(AppUserPendingEmail)
            .values({ appUserId: ctx.session.appUserId, email })
            .onConflictDoUpdate({
              target: AppUserPendingEmail.appUserId,
              set: { email, key: randomUUID(), createdAt: new Date() },
            });
          return {
            // Only a proven inbox is worth warning.
            oldEmail: currentEmail?.verifiedAt ? currentEmail.email : null,
          };
        });

        // Tell the verified address that's being replaced, so a change made
        // from a stolen session doesn't go unnoticed.
        if (emailChange?.oldEmail) {
          try {
            await sendEmailChangeNotice({
              stage: 'requested',
              appUserId: ctx.session.appUserId,
              username: input.username,
              oldEmail: emailChange.oldEmail,
              newEmail: email,
            });
          } catch (error) {
            moduleLogger.error(
              {
                context: {
                  userId: ctx.session.appUserId,
                  error: error instanceof Error ? error.message : String(error),
                },
              },
              'Email change requested, but the notice to the old address could not be scheduled',
            );
          }
        }

        if (emailChange) {
          try {
            await startBackground('postUserRegistrationWorkflow', {
              ...staticMeta({
                summary: `Verify changed email — @${input.username}`,
              }),
              args: [
                {
                  userId: ctx.session.appUserId,
                  username: input.username,
                  email,
                  subscribeToNewsletter: false,
                  verificationKind: 'email-change',
                },
              ],
              workflowId: `email-change-verification:${ctx.session.appUserId}:${Date.now()}`,
              taskQueue: BACKGROUND_QUEUE,
            });
          } catch (error) {
            moduleLogger.error(
              {
                context: {
                  userId: ctx.session.appUserId,
                  error: error instanceof Error ? error.message : String(error),
                },
              },
              'Profile email changed, but the verification email could not be scheduled',
            );
          }
        }

        moduleLogger.info(
          {
            context: {
              userId: ctx.session.appUserId,
              username: input.username,
            },
          },
          'Profile update successful',
        );

        return {
          error: false,
          pendingEmail: emailChange ? email : null,
        };
      } catch (e) {
        moduleLogger.error(
          {
            context: {
              userId: ctx.session.appUserId,
              username: input.username,
              error: e instanceof Error ? e.message : String(e),
            },
          },
          'Profile update failed - database error',
        );
        return { error: 'Error updating profile, please try again!' };
      }
    }),

  cancelEmailChange: authProcedure.mutation(async ({ ctx }) => {
    await db
      .delete(AppUserPendingEmail)
      .where(eq(AppUserPendingEmail.appUserId, ctx.session.appUserId));
    return { cancelled: true as const };
  }),

  changePassword: authProcedure
    .input(passwordChangeSchema)
    .mutation(async ({ ctx, input }): Promise<PasswordChangeResponse> => {
      moduleLogger.info(
        {
          context: {
            userId: ctx.session.appUserId,
          },
        },
        'Password change attempt',
      );

      const passwordTest = testPassword(input.newPassword);

      if (passwordTest) {
        moduleLogger.warn(
          {
            context: {
              userId: ctx.session.appUserId,
              passwordError: passwordTest,
            },
          },
          'Password change failed - weak password',
        );
        return { error: passwordTest };
      }

      try {
        const user = await db.query.AppUser.findFirst({
          where: (t, { eq }) => eq(t.id, ctx.session.appUserId),
          columns: {
            id: true,
            password: true,
          },
        });

        if (!user) {
          moduleLogger.error(
            {
              context: {
                userId: ctx.session.appUserId,
              },
            },
            'Password change failed - user not found',
          );
          throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
        }

        if (user.password) {
          if (!input.currentPassword) {
            return { error: 'Current password is required' };
          }
          const isCurrentPasswordValid = await argon2.verify(
            user.password,
            input.currentPassword,
          );

          if (!isCurrentPasswordValid) {
            moduleLogger.warn(
              {
                appUserId: ctx.session.appUserId,
              },
              'Password change failed - invalid current password',
            );
            return { error: 'Current password is incorrect' };
          }
        }

        const newHash = await argon2.hash(input.newPassword, {
          type: argon2.argon2id,
        });

        await db
          .update(AppUser)
          .set({ password: newHash, updatedAt: new Date() })
          .where(eq(AppUser.id, ctx.session.appUserId));

        moduleLogger.info(
          {
            context: {
              userId: ctx.session.appUserId,
            },
          },
          'Password change successful',
        );

        return { error: false };
      } catch (e) {
        moduleLogger.error(
          {
            context: {
              userId: ctx.session.appUserId,
              error: e instanceof Error ? e.message : String(e),
            },
          },
          'Password change failed - database error',
        );
        return { error: 'Error changing password, please try again!' };
      }
    }),

  createMultipartUpload: authProcedure
    .input(multipartUploadSchema)
    .mutation(async ({ ctx, input: { uploadMimeType, bytes } }) => {
      // The profile avatar always belongs to the authenticated user. Ignore any
      // client-supplied targetId: trusting it would let any logged-in user
      // overwrite another user's avatar (and, because targetId is also used as
      // the image worker's working-directory name, supply path-traversal
      // values). Derive the target from the session instead.
      const targetId = ctx.session?.appUserId;
      invariant(targetId, 'No user found');

      const location = await placeImageUpload(bytes);

      const { uploadKey, uploadId } =
        await location.ingest.createMultipartUpload(targetId, uploadMimeType);

      await handleMultipartMediaUpload(
        targetId,
        location.id,
        uploadId,
        uploadKey,
        'profileAvatar',
      );

      const urls = await location.ingest.createPresignedPartUploadUrls(
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

  finalizeMultipartUpload: authProcedure
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
};
