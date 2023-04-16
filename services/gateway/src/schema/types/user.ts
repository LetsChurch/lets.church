import {
  AppUserRole,
  type AppUser as PrismaAppUser,
  Prisma,
} from '@prisma/client';
import argon2 from 'argon2';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { ZodError, ZodIssueCode } from 'zod';
import builder from '../builder';
import type { Context } from '../../util/context';
import zxcvbn from '../../util/zxcvbn';
import { sendEmail } from '../../temporal';
import { createSessionJwt } from '../../util/jwt';
import prisma from '../../util/prisma';
import { getPublicMediaUrl } from '../../util/url';

async function privateAuthScopes(
  appUser: Pick<PrismaAppUser, 'id'>,
  _args: unknown,
  context: Context,
) {
  const session = await context.session;

  // Users can see their own private fields
  if (session?.appUserId === appUser.id) {
    return true;
  }

  // Otherwise require admin scope
  return { admin: true };
}

const AppUserRoleEnum = builder.enumType('AppUserRole', {
  values: Object.keys(AppUserRole),
});

builder.prismaObject('AppUserEmail', {
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    email: t.exposeString('email'),
    verified: t.exposeBoolean('verified'),
  }),
});

export const AppUser = builder.prismaObject('AppUser', {
  select: { id: true, password: true, role: true },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    fullName: t.expose('fullName', { type: 'String', nullable: true }),
    emails: t.relation('emails'),
    username: t.exposeString('username'),
    avatarUrl: t.field({
      type: 'String',
      nullable: true,
      select: { avatarPath: true },
      resolve: ({ avatarPath }) => {
        if (!avatarPath) {
          return null;
        }

        return getPublicMediaUrl(avatarPath);
      },
    }),
    role: t.field({ type: AppUserRoleEnum, resolve: ({ role }) => role }),
    canUpload: t.boolean({
      select: { id: true },
      authScopes: async ({ id }, _args, context) => {
        if ((await context.session)?.appUserId === id) {
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
      },
    ),
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
  }),
});

builder.queryFields((t) => ({
  me: t.prismaField({
    type: AppUser,
    nullable: true,
    resolve: async (query, _root, _args, context, _info) => {
      const session = await context.session;

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
      const s = await session;

      invariant(s, 'No session!');

      await prisma.appSession.update({
        where: { id: s.id },
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
    },
    validate: {
      schema: z.object({
        username: z.string().min(3).max(20),
        password: z
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
          }),
        email: z.string().email(),
        fullName: z.string().max(100).optional(),
        agreeToTerms: z.literal(true),
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
      { username, password, email, fullName },
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

      await sendEmail(`signup:${email}`, {
        from: 'noreply@lets.church',
        to: email,
        subject: `Welcome to Let's Church! Please confirm your email.`,
        text: `Welcome, ${username}!`,
        html: `Welcome, <b>${username}</b>!`,
      });

      return user;
    },
  }),
  updateUser: t.prismaField({
    type: AppUser,
    args: {
      userId: t.arg({ type: 'ShortUuid', required: true }),
      email: t.arg.string({ required: true }),
      fullName: t.arg.string({ required: true }),
    },
    authScopes: async (_parent, { userId }, context) => {
      const session = await context.session;

      if (session?.appUser.id === userId) {
        return true;
      }

      return { admin: true };
    },
    resolve: async (query, _parent, { userId, fullName, email }, _context) => {
      await prisma.appUserEmail.upsert({
        where: { email },
        create: { email, appUser: { connect: { id: userId } } },
        update: {},
      });
      return prisma.appUser.update({
        ...query,
        where: { id: userId },
        data: { fullName },
      });
    },
  }),
}));
