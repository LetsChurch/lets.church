import { prisma, type TransactionClient } from '@letschurch/db';
import { TRPCError } from '@trpc/server';
import * as argon2 from 'argon2';
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
import { ingestS3, PART_SIZE, publicS3 } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import testPassword from '@/util/zxcvbn';
import { authProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/account',
});

type ProfileUpdateResponse = { error: false } | { error: string };
type PasswordChangeResponse = { error: false } | { error: string };

export const accountProcedures = {
  getProfile: authProcedure.query(async ({ ctx }) => {
    const user = await prisma.appUser.findUnique({
      where: { id: ctx.session.appUserId },
      select: {
        id: true,
        username: true,
        fullName: true,
        emails: {
          select: {
            email: true,
          },
        },
        avatarPath: true,
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
        const existingUser = await prisma.appUser.findFirst({
          where: {
            username: input.username,
            id: { not: ctx.session.appUserId },
          },
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

        const existingEmail = await prisma.appUserEmail.findFirst({
          where: {
            email: input.email,
            appUser: { id: { not: ctx.session.appUserId } },
          },
        });

        if (existingEmail) {
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

        await prisma.$transaction(async (txRaw) => {
          // Type assertion required due to TypeScript limitations with Omit and getter properties
          // See: https://github.com/prisma/prisma/issues/20738
          const tx = txRaw as TransactionClient;
          await tx.appUser.update({
            where: { id: ctx.session.appUserId },
            data: {
              username: input.username,
              fullName: input.fullName,
            },
          });

          const currentEmail = await tx.appUserEmail.findFirst({
            where: {
              appUserId: ctx.session.appUserId,
            },
          });

          if (currentEmail?.email !== input.email) {
            if (currentEmail) {
              await tx.appUserEmail.delete({
                where: { id: currentEmail.id },
              });
            }

            await tx.appUserEmail.create({
              data: {
                email: input.email,
                appUserId: ctx.session.appUserId,
              },
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
        const user = await prisma.appUser.findUnique({
          where: { id: ctx.session.appUserId },
          select: {
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

        await prisma.appUser.update({
          where: { id: ctx.session.appUserId },
          data: { password: newHash },
        });

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
    .mutation(async ({ input: { targetId, uploadMimeType, bytes } }) => {
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
