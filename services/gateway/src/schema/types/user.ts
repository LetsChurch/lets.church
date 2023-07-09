import {
  AppUserRole,
  type AppUser as PrismaAppUser,
  Prisma,
} from '@prisma/client';
import argon2 from 'argon2';
import invariant from 'tiny-invariant';
import * as z from 'zod';
import { ZodError, ZodIssueCode } from 'zod';
import short from 'short-uuid';
import envariant from '@knpwrs/envariant';
import { stripIndent } from 'proper-tags';
import builder from '../builder';
import type { Context } from '../../util/context';
import zxcvbn from '../../util/zxcvbn';
import { sendEmail } from '../../temporal';
import { createSessionJwt } from '../../util/jwt';
import prisma from '../../util/prisma';
import { getPublicMediaUrl } from '../../util/url';
import { emailHtml } from '../../util/email';

const WEB_URL = envariant('WEB_URL');

const uuidTranslator = short();

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
    subscribedToNewsletter: t.field({
      type: 'Boolean',
      authScopes: privateAuthScopes,
      select: { id: true, emails: { select: { email: true } } },
      resolve: async (user) =>
        (
          await prisma.newsletterSubscription.findMany({
            where: { email: { in: user.emails.map(({ email }) => email) } },
          })
        ).length > 0,
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
      agreeToTheology: t.arg.boolean({ required: true }),
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
        agreeToTheology: z.literal(true),
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
  subscribeToNewsletter: t.boolean({
    args: {
      email: t.arg.string({ required: true }),
    },
    validate: {
      schema: z.object({
        email: z.string().email(),
      }),
    },
    errors: {
      types: [ZodError],
    },
    resolve: async (_parent, { email }, context) => {
      try {
        const sub = await prisma.newsletterSubscription.create({
          data: {
            email,
          },
        });

        const verifyUrl = `${WEB_URL}/newsletter/verify?${new URLSearchParams({
          subscriptionId: uuidTranslator.fromUUID(sub.id),
          emailKey: uuidTranslator.fromUUID(sub.key),
        })}`;

        const session = await context.session;

        // If any of the emails associated with the currently logged-in account are being subscribed, skip sending a confirmation email
        if (!session?.appUser.emails.some((e) => e.email === email)) {
          await sendEmail(`subscription:${email}`, {
            from: 'hello@lets.church',
            to: email,
            subject: "Please Verify Your Email for the Let's Church Newsletter",
            text: `You have subscribed to the Let's Church Newsletter. Please visit the following link to verify your email: ${verifyUrl}`,
            html: emailHtml(
              "Let's Church Newsletter",
              stripIndent`
                You have been subscribed to the Let's Church Newsletter. Please click <a href="${verifyUrl}">here</a> to verify your email.

                Alternatively, visit the following link to verify your email: ${verifyUrl}
              `,
            ).html,
          });
        }

        return true;
      } catch (e) {
        return false;
      }
    },
  }),
  unsubscribeFromNewsletter: t.boolean({
    args: {
      subscriptionId: t.arg({ type: 'ShortUuid', required: true }),
      emailKey: t.arg({ type: 'ShortUuid', required: true }),
    },
    resolve: async (_root, { subscriptionId, emailKey }) => {
      const res = await prisma.appUserEmail.deleteMany({
        where: {
          id: subscriptionId,
          key: emailKey,
        },
      });

      return res.count > 0;
    },
  }),
  verifyNewsletterSubscription: t.boolean({
    args: {
      subscriptionId: t.arg({ type: 'ShortUuid', required: true }),
      emailKey: t.arg({ type: 'ShortUuid', required: true }),
    },
    resolve: async (_root, { subscriptionId, emailKey }) => {
      const res = await prisma.appUserEmail.updateMany({
        data: {
          verifiedAt: new Date(),
        },
        where: {
          id: subscriptionId,
          key: emailKey,
        },
      });

      return res.count > 0;
    },
  }),
}));
