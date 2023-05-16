import invariant from 'tiny-invariant';
import {
  UploadLicense as PrismaUploadLicense,
  UploadVisibility as PrismaUploadVisibility,
  UploadVariant as PrismaUploadVariant,
  Rating as PrismaRating,
  Prisma,
} from '@prisma/client';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { queryFromInfo } from '@pothos/plugin-prisma';
import { xxh32 } from '@node-rs/xxhash';
import { indexDocument } from '../../temporal';
import builder from '../builder';
import type { Context } from '../../util/context';
import prisma from '../../util/prisma';
import { getPublicMediaUrl } from '../../util/url';
import { getPublicUrlWithFilename } from '../../util/s3';

async function internalAuthScopes(
  uploadRecord: { id: string; channelId: string },
  _args: unknown,
  context: Context,
) {
  const userId = (await context.session)?.appUserId;

  if (!userId) {
    return false;
  }

  // TODO: can this be done more efficiently at scale?
  const membership = await prisma.channelMembership.findUnique({
    select: {
      isAdmin: true,
      canUpload: true,
    },
    where: {
      channelId_appUserId: {
        channelId: uploadRecord.channelId,
        appUserId: userId,
      },
    },
  });

  if (membership) {
    return membership.isAdmin || membership.canUpload;
  }

  return { admin: true };
}

const Rating = builder.enumType('Rating', {
  values: ['LIKE', 'DISLIKE'] as const,
});

const UploadLicense = builder.enumType('UploadLicense', {
  values: Object.keys(PrismaUploadLicense),
});

const UploadVisibility = builder.enumType('UploadVisibility', {
  values: Object.keys(PrismaUploadVisibility),
});

const UploadVariant = builder.enumType('UploadVariant', {
  values: Object.keys(PrismaUploadVariant),
});

const UploadUserComment = builder.prismaObject('UploadUserComment', {
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    uploadRecordId: t.expose('uploadRecordId', { type: 'ShortUuid' }),
    replyingTo: t.relation('replyingTo'),
    createdAt: t.field({
      type: 'DateTime',
      select: {
        createdAt: true,
      },
      resolve: ({ createdAt }) => createdAt.toISOString(),
    }),
    updatedAt: t.field({
      type: 'DateTime',
      select: {
        updatedAt: true,
      },
      resolve: ({ updatedAt }) => updatedAt.toISOString(),
    }),
    author: t.relation('author'),
    upload: t.relation('upload'),
    replies: t.relatedConnection('replies', {
      cursor: 'id',
      totalCount: true,
      query: { orderBy: { createdAt: Prisma.SortOrder.asc } },
    }),
    text: t.exposeString('text'),
    totalLikes: t.relationCount('userRatings', { where: { rating: 'LIKE' } }),
    totalDislikes: t.relationCount('userRatings', {
      where: { rating: 'DISLIKE' },
    }),
    myRating: t.field({
      nullable: true,
      type: Rating,
      resolve: async (root, _args, context) => {
        const userId = (await context.session)?.appUserId;

        if (!userId) {
          return null;
        }

        const record = await prisma.uploadUserCommentRating.findUnique({
          where: {
            appUserId_uploadUserCommentId: {
              appUserId: userId,
              uploadUserCommentId: root.id,
            },
          },
        });

        if (!record) {
          return null;
        }

        return record.rating;
      },
    }),
  }),
});

const UploadRecord = builder.prismaObject('UploadRecord', {
  select: {
    id: true,
    channelId: true, // For authScopes
  },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    title: t.exposeString('title', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    license: t.expose('license', { type: UploadLicense }),
    visibility: t.expose('visibility', { type: UploadVisibility }),
    createdBy: t.relation('createdBy', { authScopes: internalAuthScopes }),
    uploadFinalizedBy: t.relation('uploadFinalizedBy', {
      authScopes: internalAuthScopes,
    }),
    variants: t.expose('variants', { type: [UploadVariant], nullable: false }),
    thumbnailUrl: t.string({
      nullable: true,
      select: { defaultThumbnailPath: true },
      resolve: ({ defaultThumbnailPath }) => {
        if (!defaultThumbnailPath) {
          return null;
        }

        return getPublicMediaUrl(defaultThumbnailPath);
      },
    }),
    thumbnailBlurhash: t.exposeString('thumbnailBlurhash', { nullable: true }),
    transcript: t.field({
      type: [
        builder.simpleObject('TranscriptLine', {
          fields: (f) => ({
            start: f.float(),
            end: f.float(),
            text: f.string(),
          }),
        }),
      ],
      nullable: true,
      resolve: async ({ id }) => {
        try {
          const url = getPublicMediaUrl(`${id}/transcript.vtt`);
          const res = await fetch(url);

          if (!res.ok) {
            return null;
          }

          const text = await res.text();
          const parsed = parseVtt(text)
            .filter((n): n is NodeCue => n.type === 'cue')
            .map(({ data: { start, end, text } }) => ({ start, end, text }));

          return parsed;
        } catch (e) {
          return null;
        }
      },
    }),
    channel: t.relation('channel'),
    uploadSizeBytes: t.field({
      type: 'SafeInt',
      select: { uploadSizeBytes: true },
      nullable: true,
      resolve: ({ uploadSizeBytes }) => Number(uploadSizeBytes?.valueOf()),
    }),
    uploadFinalized: t.exposeBoolean('uploadFinalized', {
      authScopes: internalAuthScopes,
    }),
    createdAt: t.field({
      type: 'DateTime',
      select: {
        createdAt: true,
      },
      resolve: ({ createdAt }) => createdAt.toISOString(),
    }),
    updatedAt: t.field({
      type: 'DateTime',
      select: {
        updatedAt: true,
      },
      resolve: ({ updatedAt }) => updatedAt.toISOString(),
    }),
    publishedAt: t.field({
      type: 'DateTime',
      nullable: true,
      select: {
        publishedAt: true,
      },
      resolve: ({ publishedAt }) => publishedAt?.toISOString(),
    }),
    canMutate: t.boolean({
      resolve: async (root, args, context) => {
        const res = await internalAuthScopes(root, args, context);

        if (typeof res === 'boolean') {
          return res;
        }

        const ses = await context.session;

        return ses?.appUser.role === 'ADMIN';
      },
    }),
    totalLikes: t.relationCount('userRatings', { where: { rating: 'LIKE' } }),
    totalDislikes: t.relationCount('userRatings', {
      where: { rating: 'DISLIKE' },
    }),
    myRating: t.field({
      nullable: true,
      type: Rating,
      resolve: async (root, _args, context) => {
        const userId = (await context.session)?.appUserId;

        if (!userId) {
          return null;
        }

        const record = await prisma.uploadUserRating.findUnique({
          where: {
            appUserId_uploadRecordId: {
              appUserId: userId,
              uploadRecordId: root.id,
            },
          },
        });

        if (!record) {
          return null;
        }

        return record.rating;
      },
    }),
    userCommentsEnabled: t.exposeBoolean('userCommentsEnabled'),
    userComments: t.connection(
      {
        type: UploadUserComment,
        resolve: async (root, args, context, info) => {
          const [res, totalCount] = await Promise.all([
            resolveOffsetConnection({ args }, async ({ offset, limit }) => {
              const query = queryFromInfo({
                context,
                info,
                path: ['edges', 'node'],
                typeName: 'UploadUserComment',
              });
              return prisma.uploadUserComment.findMany({
                ...query,
                where: { uploadRecordId: root.id, replyingTo: null },
                skip: offset,
                take: limit,
                orderBy: { score: Prisma.SortOrder.desc },
              });
            }),
            prisma.uploadUserComment.count({
              where: { uploadRecordId: root.id },
            }),
          ]);

          return {
            totalCount,
            ...res,
          };
        },
      },
      {
        name: 'UploadRecordUserCommentsConnection',
        fields: (t) => ({
          totalCount: t.int({
            resolve: (root) => root.totalCount,
          }),
        }),
      },
    ),
    mediaSource: t.string({
      nullable: true,
      select: { id: true, variants: true },
      resolve: async (root, _args, _context) => {
        if (!root.variants.some((v) => v.startsWith('VIDEO'))) {
          return null;
        }

        return getPublicMediaUrl(`${root.id}/master.m3u8`);
      },
    }),
    audioSource: t.string({
      nullable: true,
      select: { id: true, variants: true },
      resolve: async (root, _args, _context) => {
        if (!root.variants.includes('AUDIO')) {
          return null;
        }

        return getPublicMediaUrl(`${root.id}/AUDIO.m3u8`);
      },
    }),
    downloadsEnabled: t.exposeBoolean('downloadsEnabled'),
    downloadUrls: t.field({
      nullable: true,
      type: [
        builder.simpleObject('MediaDownload', {
          fields: (f) => ({
            kind: f.field({
              type: builder.enumType('MediaDownloadKind', {
                values: [
                  'VIDEO_4K',
                  'VIDEO_1080P',
                  'VIDEO_720P',
                  'VIDEO_480P',
                  'VIDEO_360P',
                  'AUDIO',
                ] as const,
              }),
            }),
            label: f.string(),
            url: f.string(),
          }),
        }),
      ],
      select: { id: true, variants: true, title: true },
      resolve: (root) =>
        Promise.all(
          root.variants
            .filter((v) => v.endsWith('_DOWNLOAD'))
            .map(async (v) => {
              const ext = v.startsWith('VIDEO') ? 'mp4' : 'm4a';
              return {
                kind:
                  v === 'VIDEO_4K_DOWNLOAD'
                    ? ('VIDEO_4K' as const)
                    : v === 'VIDEO_1080P_DOWNLOAD'
                    ? ('VIDEO_1080P' as const)
                    : v === 'VIDEO_720P_DOWNLOAD'
                    ? ('VIDEO_720P' as const)
                    : v === 'VIDEO_480P'
                    ? ('VIDEO_480P' as const)
                    : v === 'VIDEO_360P'
                    ? ('VIDEO_360P' as const)
                    : ('AUDIO' as const),
                label:
                  v === 'VIDEO_4K_DOWNLOAD'
                    ? '4k Video'
                    : v === 'VIDEO_1080P_DOWNLOAD'
                    ? '1080p Video'
                    : v === 'VIDEO_720P_DOWNLOAD'
                    ? '720p Video'
                    : v === 'VIDEO_480P'
                    ? '480p Video'
                    : v === 'VIDEO_360P'
                    ? '360p Video'
                    : 'Audio',
                url: await getPublicUrlWithFilename(
                  `${root.id}/${v}.${ext}`,
                  `${root.title ?? root.id}.${ext}`,
                ),
              };
            }),
        ),
    }),
    totalViews: t.relationCount('uploadViews'),
  }),
});

builder.queryFields((t) => ({
  uploadRecordById: t.prismaField({
    type: UploadRecord,
    args: {
      id: t.arg({ type: 'ShortUuid', required: true }),
    },
    resolve: (query, _root, { id }, _context) =>
      prisma.uploadRecord.findUniqueOrThrow({ ...query, where: { id } }),
  }),
  mySubscriptionUploadRecords: t.connection({
    type: UploadRecord,
    nullable: true,
    resolve: async (_root, args, context, info) => {
      const userId = (await context.session)?.appUserId;

      if (!userId) {
        return null;
      }

      const query = queryFromInfo({
        context,
        info,
        path: ['edges', 'node'],
        typeName: 'UploadRecord',
      });

      return resolveOffsetConnection({ args }, async ({ offset, limit }) => {
        return prisma.uploadRecord.findMany({
          ...query,
          skip: offset,
          take: limit,
          where: {
            channel: {
              subscribers: {
                some: {
                  appUserId: userId,
                },
              },
            },
          },
          orderBy: {
            publishedAt: Prisma.SortOrder.desc,
          },
        });
      });
    },
  }),
  uploadRecords: t.connection({
    type: UploadRecord,
    args: {
      orderBy: t.arg({
        type: builder.enumType('UploadRecordsOrder', {
          values: ['trending', 'latest'] as const,
        }),
      }),
    },
    resolve: async (_root, args, context, info) => {
      const query = queryFromInfo({
        context,
        info,
        path: ['edges', 'node'],
        typeName: 'UploadUserComment',
      });

      return resolveOffsetConnection({ args }, async ({ offset, limit }) => {
        return prisma.uploadRecord.findMany({
          ...query,
          skip: offset,
          take: limit,
          orderBy:
            args.orderBy === 'trending'
              ? {
                  score: Prisma.SortOrder.desc,
                }
              : {
                  publishedAt: Prisma.SortOrder.desc,
                },
        });
      });
    },
  }),
}));

builder.mutationFields((t) => ({
  upsertUploadRecord: t.prismaField({
    type: UploadRecord,
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid' }),
      title: t.arg.string(),
      description: t.arg.string(),
      publishedAt: t.arg({ type: 'DateTime', required: true }),
      license: t.arg({ type: UploadLicense, required: true }),
      visibility: t.arg({ type: UploadVisibility, required: true }),
      userCommentsEnabled: t.arg({ type: 'Boolean', required: false }),
      downloadsEnabled: t.arg({ type: 'Boolean', required: false }),
      channelId: t.arg({ type: 'ShortUuid', required: true }),
    },
    authScopes: async (_root, args, context) => {
      const userId = (await context.session)?.appUserId;

      if (!userId) {
        return false;
      }

      // TODO: can this be done more efficiently at scale?
      const membership = await prisma.channelMembership.findUnique({
        select: {
          isAdmin: true,
          canUpload: true,
        },
        where: {
          channelId_appUserId: {
            channelId: args.channelId,
            appUserId: userId,
          },
        },
      });

      if (membership) {
        return membership.isAdmin || membership.canUpload;
      }

      return { admin: true };
    },
    resolve: async (
      query,
      _root,
      {
        uploadRecordId,
        title = null,
        description = null,
        publishedAt,
        license,
        visibility,
        userCommentsEnabled = true,
        downloadsEnabled = true,
        channelId,
      },
      context,
    ) => {
      const userId = (await context.session)?.appUserId;
      invariant(userId, 'No user found!');
      invariant(license in PrismaUploadLicense, 'Invalid license');
      const lice = license as PrismaUploadLicense;
      invariant(visibility in PrismaUploadVisibility, 'Invalid visibility');
      const vis = visibility as PrismaUploadVisibility;
      invariant(typeof userCommentsEnabled === 'boolean');
      invariant(typeof downloadsEnabled === 'boolean');

      if (uploadRecordId) {
        const res = await prisma.uploadRecord.update({
          ...query,
          where: { id: uploadRecordId },
          data: {
            title,
            description,
            publishedAt,
            license: lice,
            visibility: vis,
            userCommentsEnabled,
            downloadsEnabled,
            channel: {
              connect: {
                id: channelId,
              },
            },
          },
        });

        await indexDocument('upload', uploadRecordId);

        return res;
      }

      const res = await prisma.uploadRecord.create({
        ...query,
        data: {
          title,
          description,
          publishedAt,
          license: lice,
          visibility: vis,
          userCommentsEnabled,
          downloadsEnabled,
          createdBy: {
            connect: {
              id: userId,
            },
          },
          channel: {
            connect: {
              id: channelId,
            },
          },
        },
      });

      await indexDocument('upload', res.id);

      return res;
    },
  }),
  rateUpload: t.boolean({
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
      rating: t.arg({
        type: Rating,
        required: true,
      }),
    },
    authScopes: { authenticated: true }, // TODO: restrict rating private uploads
    resolve: async (_root, { uploadRecordId, rating }, context, _info) => {
      const userId = (await context.session)?.appUserId;

      if (!userId) {
        return false;
      }

      await prisma.$transaction(async (tx) => {
        // 1. Get existing rating
        const existing = await tx.uploadUserRating.findFirst({
          where: { appUserId: userId, uploadRecordId, rating },
        });
        // 2. Delete any existing rating
        await tx.uploadUserRating.deleteMany({
          where: {
            appUserId: userId,
            uploadRecordId,
          },
        });
        // 3. If the new rating is different from any existing rating, create it
        const changed = existing?.rating !== rating;
        if (changed) {
          await tx.uploadUserRating.create({
            data: { appUserId: userId, uploadRecordId, rating },
          });
          await tx.uploadRecord.update({
            where: {
              id: uploadRecordId,
            },
            data: {
              scoreStaleAt: new Date(),
            },
          });
        }
      });

      return true;
    },
  }),
  upsertUploadUserComment: t.prismaField({
    type: UploadUserComment,
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
      replyingTo: t.arg({ type: 'ShortUuid', required: false }),
      commentId: t.arg({ type: 'ShortUuid', required: false }),
      text: t.arg.string({ required: true }),
    },
    authScopes: async (_root, { uploadRecordId, commentId }, context) => {
      const userId = (await context.session)?.appUserId;
      invariant(userId, 'No user found!');

      const upRec = await prisma.uploadRecord.findUniqueOrThrow({
        where: { id: uploadRecordId },
        select: { userCommentsEnabled: true },
      });

      // Only admins can comment when comments are disabled
      if (!upRec.userCommentsEnabled) {
        return { admin: true };
      }

      // Do not allow modifying other users' comments
      if (commentId) {
        const comment = await prisma.uploadUserComment.findUniqueOrThrow({
          where: { id: commentId },
          select: { authorId: true },
        });

        if (comment.authorId !== userId) {
          return { admin: true };
        }
      }

      // TODO: restrict commenting on private uploads
      return { authenticated: true };
    },
    resolve: async (
      query,
      _root,
      { uploadRecordId, commentId, replyingTo, text },
      context,
      _info,
    ) => {
      const userId = (await context.session)?.appUserId;
      invariant(userId, 'No user found!');

      // If we are replying, make sure the parent comment is on the same upload
      if (replyingTo) {
        const parentComment = await prisma.uploadUserComment.findUniqueOrThrow({
          where: { id: replyingTo },
          select: { uploadRecordId: true },
        });
        invariant(
          parentComment.uploadRecordId === uploadRecordId,
          'Mismatch replyingTo and uploadRecordId!',
        );
      }

      if (commentId) {
        return prisma.uploadUserComment.update({
          ...query,
          where: { id: commentId },
          data: {
            text,
            author: { connect: { id: userId } },
            upload: { connect: { id: uploadRecordId } },
            ...(replyingTo
              ? { replyingTo: { connect: { id: replyingTo } } }
              : {}),
          },
        });
      }

      return prisma.uploadUserComment.create({
        ...query,
        data: {
          text,
          author: { connect: { id: userId } },
          upload: { connect: { id: uploadRecordId } },
          ...(replyingTo
            ? { replyingTo: { connect: { id: replyingTo } } }
            : {}),
          userRatings: {
            create: {
              appUser: {
                connect: { id: userId },
              },
              rating: PrismaRating.LIKE,
            },
          },
        },
      });
    },
  }),
  rateComment: t.boolean({
    args: {
      uploadUserCommentId: t.arg({ type: 'ShortUuid', required: true }),
      rating: t.arg({
        type: Rating,
        required: true,
      }),
    },
    authScopes: { authenticated: true }, // TODO: restrict rating comments on private uploads
    resolve: async (_root, { uploadUserCommentId, rating }, context, _info) => {
      const userId = (await context.session)?.appUserId;

      if (!userId) {
        return false;
      }

      await prisma.$transaction(async (tx) => {
        // 1. Get existing rating
        const existing = await tx.uploadUserCommentRating.findFirst({
          where: { appUserId: userId, uploadUserCommentId, rating },
        });
        // 2. Delete any existing rating
        await tx.uploadUserCommentRating.deleteMany({
          where: {
            appUserId: userId,
            uploadUserCommentId,
          },
        });
        // 3. If the new rating is different from any existing rating, create it
        if (existing?.rating !== rating) {
          await tx.uploadUserCommentRating.create({
            data: { appUserId: userId, uploadUserCommentId, rating },
          });
        }
      });

      return true;
    },
  }),
  recordUploadView: t.boolean({
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
    },
    resolve: async (
      _root,
      { uploadRecordId },
      { clientIp, clientUserAgent, session },
    ) => {
      const res = await prisma.trackingSalt.findFirst({
        orderBy: { id: 'desc' },
      });

      if (!res || !clientIp || !clientUserAgent) {
        return false;
      }

      // The view hash will change once daily since the salt changes once daily, this means that each user can count for one view per day
      const viewHash = xxh32(
        (await session)?.appUserId ?? clientIp + clientUserAgent,
        res.salt,
      );

      await prisma.uploadView.upsert({
        where: { uploadRecordId_viewHash: { uploadRecordId, viewHash } },
        create: {
          uploadRecordId,
          viewHash,
          appUserId: (await session)?.appUserId ?? null,
        },
        update: { count: { increment: 1 } },
      });

      return true;
    },
  }),
}));
