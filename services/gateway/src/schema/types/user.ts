import {
  AppUserRole,
  type AppUser as PrismaAppUser,
  Prisma,
  UploadListType,
} from '@prisma/client';
import argon2 from 'argon2';
import invariant from 'tiny-invariant';
import { z, ZodError, ZodIssueCode } from 'zod';
import envariant from '@knpwrs/envariant';
import { stripIndent } from 'proper-tags';
import { v4 as uuid } from 'uuid';
import builder from '../builder';
import type { Context } from '../../util/context';
import zxcvbn from '../../util/zxcvbn';
import {
  completeResetPassword,
  resetPassword,
  sendEmail,
} from '../../temporal';
import { createSessionJwt } from '../../util/jwt';
import prisma from '../../util/prisma';
import { getPublicImageUrl } from '../../util/url';
import { emailHtml } from '../../util/email';
import { uuidTranslator } from '../../util/uuid';
import { getS3ProtocolUri } from '../../util/s3';
import logger from '../../util/logger';
import { ResizeParams } from './misc';
import { OrganizationTypeEnum } from './organization';

const moduleLogger = logger.child({ module: 'schema/types/user' });

const WEB_URL = envariant('WEB_URL');

function privateAuthScopes(
  appUser: Pick<PrismaAppUser, 'id'>,
  _args: unknown,
  context: Context,
) {
  // Users can see their own private fields
  if (context.session?.appUserId === appUser.id) {
    return true;
  }

  // Otherwise require admin scope
  return { admin: true };
}

const AppUserRoleEnum = builder.enumType(AppUserRole, { name: 'AppUserRole' });

const passwordSchema = z
  .string()
  .max(100)
  .superRefine((val, ctx) => {
    const message = zxcvbn(val);

    if (message) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        message,
      });
    }
  });

builder.prismaObject('AppUserEmail', {
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    email: t.exposeString('email'),
    verifiedAt: t.field({
      type: 'DateTime',
      select: { verifiedAt: true },
      nullable: true,
      resolve: ({ verifiedAt }) => verifiedAt?.toISOString(),
    }),
  }),
});

export const AppUser = builder.prismaObject('AppUser', {
  select: { id: true, password: true, role: true },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    fullName: t.expose('fullName', { type: 'String', nullable: true }),
    emails: t.relation('emails', {
      authScopes: async ({ id }, _args, context) => {
        if (context.session?.appUserId === id) {
          return true;
        }

        return { admin: true };
      },
    }),
    username: t.exposeString('username'),
    avatarUrl: t.field({
      type: 'String',
      nullable: true,
      args: {
        resize: t.arg({
          required: false,
          type: ResizeParams,
        }),
      },
      select: { avatarPath: true },
      resolve: ({ avatarPath }, { resize }) => {
        if (!avatarPath) {
          return null;
        }

        return getPublicImageUrl(
          getS3ProtocolUri('PUBLIC', avatarPath),
          resize ? { resize } : undefined,
        );
      },
    }),
    role: t.field({ type: AppUserRoleEnum, resolve: ({ role }) => role }),
    canUpload: t.boolean({
      select: { id: true },
      authScopes: async ({ id }, _args, context) => {
        if (context.session?.appUserId === id) {
          return true;
        }

        return { admin: true };
      },
      resolve: async ({ id }) => {
        const count = await prisma.channelMembership.count({
          where: {
            appUserId: id,
            OR: [{ canUpload: true }, { isAdmin: true }],
          },
        });

        return count > 0;
      },
    }),
    channelSubscriptionsConnection: t.relatedConnection(
      'channelSubscriptions',
      {
        cursor: 'appUserId_channelId',
        authScopes: privateAuthScopes,
      },
    ),
    channelMembershipsConnection: t.relatedConnection('channelMemberships', {
      cursor: 'channelId_appUserId',
      authScopes: privateAuthScopes,
      args: {
        canUpload: t.arg.boolean(),
      },
      query: ({ canUpload }, _context) =>
        typeof canUpload === 'boolean'
          ? {
              where: {
                OR: [{ canUpload }, { isAdmin: canUpload }],
              },
            }
          : {},
    }),
    organizationMemberhipsConnection: t.relatedConnection(
      'organizationMemberships',
      {
        cursor: 'organizationId_appUserId',
        authScopes: privateAuthScopes,
        args: {
          type: t.arg({ type: OrganizationTypeEnum, required: true }),
        },
        query: ({ type }) => ({ where: { organization: { type } } }),
      },
    ),
    playlists: t.relatedConnection('uploadLists', {
      cursor: 'createdAt_id',
      authScopes: privateAuthScopes,
      query: (_args, context) => {
        const userId = context.session?.appUserId;
        invariant(userId, 'No userId');

        return {
          where: { type: UploadListType.PLAYLIST, author: { id: userId } },
        };
      },
    }),
    createdAt: t.field({
      type: 'DateTime',
      select: { createdAt: true },
      resolve: (channel) => channel.createdAt.toISOString(),
    }),
    updatedAt: t.field({
      type: 'DateTime',
      select: { updatedAt: true },
      resolve: (channel) => channel.updatedAt.toISOString(),
    }),
    subscribedToNewsletter: t.field({
      type: 'Boolean',
      authScopes: privateAuthScopes,
      select: { id: true, emails: { select: { email: true } } },
      resolve: async (user) => {
        const res = await fetch(
          `${envariant(
            'LISTMONK_INTERNAL_URL',
          )}/api/subscribers?query=${encodeURIComponent(
            `subscribers.email in (${user.emails
              .map((e) => `'${e.email}'`)
              .join(',')})`,
          )}`,
        );
        const json: { data: { total: number } } = await res.json();
        return json.data.total > 0;
      },
    }),
  }),
});

builder.queryFields((t) => ({
  me: t.prismaField({
    type: AppUser,
    nullable: true,
    resolve: (query, _root, _args, { session }, _info) => {
      if (session) {
        return prisma.appUser.findUniqueOrThrow({
          ...query,
          where: { id: session.appUserId },
        });
      }

      return null;
    },
  }),
  usersConnection: t.prismaConnection({
    type: AppUser,
    cursor: 'id',
    maxSize: 50,
    defaultSize: 50,
    resolve: (query, _root, _args, _context, _info) =>
      prisma.appUser.findMany(query),
  }),
  userById: t.prismaField({
    type: AppUser,
    args: {
      id: t.arg({ type: 'ShortUuid', required: true }),
    },
    resolve: (query, _root, { id }, _context) => {
      return prisma.appUser.findUniqueOrThrow({
        ...query,
        where: { id },
      });
    },
  }),
}));

builder.mutationFields((t) => ({
  login: t.field({
    type: 'Jwt',
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    authScopes: {
      unauthenticated: true,
    },
    resolve: async (_parent, { id, password }, _context) => {
      const user = await prisma.appUser.findFirst({
        where: { OR: [{ username: id }, { emails: { some: { email: id } } }] },
      });

      if (!user || !(await argon2.verify(user.password, password))) {
        moduleLogger.warn(
          { id, user: user ? user : null },
          !user ? 'User not found' : 'Invalid password',
        );
        throw new Error('Error logging in. Please try again.');
      }

      const { id: sessionId } = await prisma.appSession.create({
        data: { appUserId: user.id },
      });

      return createSessionJwt({ sub: sessionId });
    },
  }),
  logout: t.boolean({
    authScopes: {
      authenticated: true,
    },
    resolve: async (_parent, _args, { session }, _info) => {
      invariant(session, 'No session!');

      await prisma.appSession.update({
        where: { id: session.id },
        data: { deletedAt: new Date() },
      });

      return true;
    },
  }),
  register: t.prismaField({
    type: AppUser,
    args: {
      email: t.arg.string({ required: true }),
      username: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      fullName: t.arg.string(),
      agreeToTerms: t.arg.boolean({ required: true }),
      agreeToTheology: t.arg.boolean({ required: true }),
      subscribeToNewsletter: t.arg.boolean({ required: false }),
    },
    validate: {
      schema: z.object({
        username: z.string().min(3).max(20),
        password: passwordSchema,
        email: z.string().email(),
        fullName: z.string().max(100).optional(),
        agreeToTerms: z.literal(true),
        agreeToTheology: z.literal(true),
        subscribeToNewsletter: z.boolean(),
      }),
    },
    errors: {
      types: [ZodError, Prisma.PrismaClientKnownRequestError],
    },
    authScopes: {
      unauthenticated: true,
    },
    resolve: async (
      query,
      _parent,
      { username, password, email, fullName, ...args },
      _context,
    ) => {
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      const user = await prisma.appUser.create({
        ...query,
        data: {
          username,
          fullName: fullName || null,
          password: passwordHash,
          emails: {
            create: {
              email,
            },
          },
        },
      });

      const { id: emailId, key: emailKey } =
        await prisma.appUserEmail.findUniqueOrThrow({
          select: { id: true, key: true },
          where: { email },
        });

      const verifyUrl = `${WEB_URL}/auth/verify?${new URLSearchParams({
        userId: uuidTranslator.fromUUID(user.id),
        emailId: uuidTranslator.fromUUID(emailId),
        emailKey: uuidTranslator.fromUUID(emailKey),
      })}`;

      await sendEmail(`signup:${email}`, {
        from: 'hello@lets.church',
        to: email,
        subject: `Welcome to Let's Church! Please verify your email.`,
        text: `Welcome, ${username}! Please visit the following link to verify your email: ${verifyUrl}`,
        html: emailHtml(
          'Welcome!',
          stripIndent`
            Welcome to Let's Church, <b>${username}</b>! Please click <a href="${verifyUrl}">here</a> to verify your email.

            Alternatively, visit the following link to verify your email: ${verifyUrl}
          `,
        ).html,
      });

      if (args.subscribeToNewsletter) {
        const form = new FormData();
        form.set('email', email);
        await fetch(
          envariant('VITE_LISTMONK_INTERNAL_URL') + '/subscription/form',
          { method: 'POST', body: form },
        );
      }

      return user;
    },
  }),
  verifyEmail: t.boolean({
    args: {
      userId: t.arg({ type: 'ShortUuid', required: true }),
      emailId: t.arg({ type: 'ShortUuid', required: true }),
      emailKey: t.arg({ type: 'ShortUuid', required: true }),
    },
    authScopes: (_root, { userId }, context) => {
      return privateAuthScopes({ id: userId }, null, context);
    },
    resolve: async (_root, { userId, emailId, emailKey }) => {
      const res = await prisma.appUserEmail.updateMany({
        data: {
          verifiedAt: new Date(),
        },
        where: {
          id: emailId,
          appUserId: userId,
          key: emailKey,
        },
      });

      return res.count > 0;
    },
  }),
  forgotPassword: t.boolean({
    args: {
      email: t.arg.string({ required: true }),
    },
    authScopes: { admin: true, unauthenticated: true },
    resolve: async (_parent, { email }) => {
      const user = await prisma.appUser.findFirst({
        select: { id: true, username: true },
        where: {
          emails: { some: { email } },
        },
      });

      if (!user) {
        return true;
      }

      const resetId = uuid();

      const resetUrl = `${WEB_URL}/auth/reset-password?${new URLSearchParams({
        id: resetId,
      })}`;

      await resetPassword(
        resetId,
        user.id,
        email,
        stripIndent`
          Hello, ${user.username}! Please visit the following link to reset your password: ${resetUrl}

          This link will expire in 15 minutes.

          If you did not request a password reset, please ignore this email.
        `,
        emailHtml(
          'Reset Password',
          stripIndent`
            Hello, <b>${user.username}</b>! Please click <a href="${resetUrl}">here</a> to reset your password.

            This link will expire in 15 minutes.

            Alternatively, visit the following link to verify your email: ${resetUrl}

            If you did not request a password reset, please ignore this email.
          `,
        ).html,
      );

      return true;
    },
  }),
  resetPassword: t.boolean({
    args: {
      id: t.arg({ type: 'Uuid', required: true }),
      password: t.arg.string({ required: true }),
    },
    validate: {
      schema: z.object({
        id: z.string().uuid(),
        password: passwordSchema,
      }),
    },
    authScopes: { admin: true, unauthenticated: true },
    resolve: async (_parent, { id, password }) => {
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      await completeResetPassword(id, passwordHash);

      return true;
    },
  }),
  upsertUser: t.prismaField({
    type: AppUser,
    args: {
      userId: t.arg({ type: 'ShortUuid', required: false }),
      username: t.arg.string({ required: false }),
      fullName: t.arg.string({ required: false }),
      email: t.arg.string({ required: true }),
      role: t.arg({ type: AppUserRoleEnum, required: false }),
      newPassword: t.arg.string({ required: false }),
    },
    // Only allow admin to update role and other users
    authScopes: (_parent, { userId, username, role }, { session }) => {
      if (username || role) {
        return { admin: true };
      }

      if (session?.appUser.id === userId) {
        return true;
      }

      return { admin: true };
    },
    resolve: async (
      query,
      _parent,
      { userId, username, fullName, email, role, newPassword },
      _context,
    ) => {
      if (userId) {
        await prisma.appUserEmail.upsert({
          where: { email },
          create: { email, appUser: { connect: { id: userId } } },
          update: {},
        });

        return prisma.appUser.update({
          ...query,
          where: { id: userId },
          data: {
            ...(username ? { username } : {}),
            ...(fullName ? { fullName } : {}),
            ...(role ? { role } : {}),
          },
        });
      }

      invariant(username, 'Missing new username');
      invariant(newPassword, 'Missing new password');

      return prisma.appUser.create({
        ...query,
        data: {
          username,
          ...(fullName ? { fullName } : {}),
          ...(role ? { role } : {}),
          password: await argon2.hash(newPassword, { type: argon2.argon2id }),
          emails: {
            create: {
              email,
            },
          },
        },
      });
    },
  }),
}));
