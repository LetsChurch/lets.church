import { AppUserRole, type AppUser as PrismaAppUser } from '@prisma/client';
import * as argon2 from 'argon2';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import builder from '../builder';
import type { Context } from '../../util/context';
import zxcvbn from '../../util/zxcvbn';
import { ZodIssueCode } from 'zod';
import { sendEmail } from '../../temporal';
import { createSessionJwt } from '../../util/jwt';

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

export const AppUser = builder.prismaObject('AppUser', {
  select: { id: true, password: true, role: true },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    email: t.exposeString('email', {
      authScopes: privateAuthScopes,
    }),
    username: t.exposeString('username'),
    role: t.field({ type: AppUserRoleEnum, resolve: ({ role }) => role }),
    channelMembershipsConnection: t.relatedConnection('channelMemberships', {
      cursor: 'channelId_appUserId',
      authScopes: privateAuthScopes,
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
        return context.prisma.appUser.findUniqueOrThrow({
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
    resolve: (query, _root, _args, context, _info) =>
      context.prisma.appUser.findMany(query),
  }),
  userById: t.prismaField({
    type: AppUser,
    args: {
      id: t.arg({ type: 'ShortUuid', required: true }),
    },
    resolve: (query, _root, { id }, context) => {
      return context.prisma.appUser.findUniqueOrThrow({
        ...query,
        where: { id },
      });
    },
  }),
}));

builder.mutationFields((t) => ({
  login: t.string({
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    authScopes: {
      unauthenticated: true,
    },
    resolve: async (_parent, { id, password }, { prisma }) => {
      const user = await prisma.appUser.findFirst({
        where: { OR: [{ username: id }, { email: id }] },
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
    resolve: async (_parent, _args, { session, prisma }, _info) => {
      const s = await session;

      invariant(s, 'No session!');

      await prisma.appSession.update({
        where: { id: s.id },
        data: { deletedAt: new Date() },
      });

      return true;
    },
  }),
  signup: t.prismaField({
    type: 'AppUser',
    args: {
      username: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
      email: t.arg.string({ required: true }),
      fullName: t.arg.string(),
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
      }),
    },
    authScopes: {
      unauthenticated: true,
    },
    resolve: async (
      query,
      _parent,
      { username, password, email, fullName },
      { prisma },
    ) => {
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });
      const user = await prisma.appUser.create({
        ...query,
        data: {
          username,
          email,
          fullName: fullName || null,
          password: passwordHash,
        },
      });
      await sendEmail(`signup:${email}`, {
        from: 'noreply@lets.church',
        to: email,
        subject: `Welcome to Let's Church! Please confirm your email.`, // TODO: What should this say?
        text: `Welcome, ${username}!`,
        html: `Welcome, <b>${username}</b>!`,
      });

      return user;
    },
  }),
}));
