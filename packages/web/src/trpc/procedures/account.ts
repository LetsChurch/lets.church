import { AppUser, AppUserEmail, db } from '@letschurch/db';
import { PART_SIZE } from '@letschurch/s3';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { TRPCError } from '@trpc/server';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import { passwordChangeSchema, profileUpdateSchema } from '@/schemas/account';
import {
  finalizeMultipartUploadSchema,
  multipartUploadSchema,
} from '@/schemas/common';
import {
  completeMultipartMediaUpload,
  handleMultipartMediaUpload,
} from '@/temporal';
import { mantineAvatarLg2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { getPublicImageUrl } from '@/util/server-env';
import testPassword from '@/util/zxcvbn';

import { authProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/account',
});

type ProfileUpdateResponse = { error: false } | { error: string };
type PasswordChangeResponse = { error: false } | { error: string };

export const accountProcedures = {
  getProfile: authProcedure.query(async ({ ctx }) => {
    const user = await db.query.AppUser.findFirst({
      where: (t, { eq }) => eq(t.id, ctx.session.appUserId),
      columns: {
        id: true,
        username: true,
        fullName: true,
        avatarPath: true,
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

    const primaryEmail = user.emails[0]?.email || '';
    const avatarPath = user.avatarPath;

    const avatarUrl = avatarPath
      ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
          resize: mantineAvatarLg2x,
        })
      : null;

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName || '',
      email: primaryEmail,
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

        const existingEmailRecord = await db.query.AppUserEmail.findFirst({
          where: (t, { eq }) => eq(t.email, input.email),
        });

        if (
          existingEmailRecord &&
          existingEmailRecord.appUserId !== ctx.session.appUserId
        ) {
          moduleLogger.warn(
            {
              context: {
                userId: ctx.session.appUserId,
                email: input.email,
              },
            },
            'Profile update failed - email taken',
          );
          return { error: 'Email is already taken' };
        }

        await db.transaction(async (tx) => {
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

          if (currentEmail?.email !== input.email) {
            if (currentEmail) {
              await tx
                .delete(AppUserEmail)
                .where(eq(AppUserEmail.id, currentEmail.id));
            }

            await tx.insert(AppUserEmail).values({
              email: input.email,
              appUserId: ctx.session.appUserId,
            });
          }
        });

        moduleLogger.info(
          {
            context: {
              userId: ctx.session.appUserId,
              username: input.username,
            },
          },
          'Profile update successful',
        );

        return { error: false };
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

      const { uploadKey, uploadId } = await ingestS3.createMultipartUpload(
        targetId,
        uploadMimeType,
      );

      await handleMultipartMediaUpload(
        targetId,
        'INGEST',
        uploadId,
        uploadKey,
        'profileAvatar',
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
