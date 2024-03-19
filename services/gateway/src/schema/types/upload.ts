import invariant from 'tiny-invariant';
import {
  UploadLicense as PrismaUploadLicense,
  UploadVisibility as PrismaUploadVisibility,
  UploadVariant as PrismaUploadVariant,
  Rating as PrismaRating,
  Prisma,
  UploadListType,
} from '@prisma/client';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { queryFromInfo } from '@pothos/plugin-prisma';
import { xxh32 } from '@node-rs/xxhash';
import { LexoRank } from 'lexorank';
import { z } from 'zod';
import { indexDocument } from '../../temporal';
import builder from '../builder';
import type { Context } from '../../util/context';
import prisma from '../../util/prisma';
import { getPublicImageUrl, getPublicMediaUrl } from '../../util/url';
import { getPublicUrlWithFilename, getS3ProtocolUri } from '../../util/s3';
import { ResizeParams } from './misc';

async function internalAuthScopes(
  uploadRecord: { id: string; channelId: string },
  _args: unknown,
  context: Context,
) {
  const userId = context.session?.appUserId;

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

export const UploadOrderPropertyEnum = builder.enumType('UploadOrderProperty', {
  values: ['createdAt', 'publishedAt'] as const,
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
        const userId = context.session?.appUserId;

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

const UploadList = builder.prismaObject('UploadList', {
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    type: t.expose('type', { type: UploadListTypeEnum }),
    title: t.exposeString('title'),
    author: t.relation('author'),
    uploads: t.prismaConnection({
      type: UploadListEntry,
      cursor: 'uploadListId_rank',
      maxSize: 50,
      defaultSize: 50,
      resolve: (query) =>
        prisma.uploadListEntry.findMany({
          ...query,
          orderBy: { rank: 'asc' },
        }),
    }),
  }),
});

const UploadRecord = builder.prismaObject('UploadRecord', {
  select: {
    id: true,
    // authscopes params
    visibility: true,
    channelId: true,
  },
  // TODO: for some reason visibility and channelId are not present
  // authScopes: async (upload, context) => {
  //   // As designed, this allows public and unlisted videos on a private channel
  //   if (
  //     !upload.visibility ||
  //     upload.visibility === PrismaUploadVisibility.PUBLIC ||
  //     upload.visibility === PrismaUploadVisibility.UNLISTED
  //   ) {
  //     return true;
  //   }
  //
  //   const appUserId = context.session?.appUserId;
  //
  //   if (
  //     appUserId &&
  //     (await prisma.channelMembership.findFirst({
  //       where: { channelId: upload.channelId, appUserId },
  //     }))
  //   ) {
  //     return true;
  //   }
  //
  //   return { admin: true };
  // },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    title: t.exposeString('title', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    lengthSeconds: t.field({
      type: 'Float',
      nullable: true,
      select: {
        lengthSeconds: true,
      },
      resolve: ({ lengthSeconds }) => lengthSeconds,
    }),
    license: t.expose('license', { type: UploadLicense }),
    visibility: t.expose('visibility', { type: UploadVisibility }),
    createdBy: t.relation('createdBy', { authScopes: internalAuthScopes }),
    uploadFinalizedBy: t.relation('uploadFinalizedBy', {
      authScopes: internalAuthScopes,
    }),
    variants: t.expose('variants', { type: [UploadVariant], nullable: false }),
    hasVideo: t.field({
      type: 'Boolean',
      select: { variants: true },
      resolve: ({ variants }) => variants.some((v) => v.startsWith('VIDEO')),
    }),
    hasAudio: t.field({
      type: 'Boolean',
      select: { variants: true },
      resolve: ({ variants }) => variants.some((v) => v.startsWith('AUDIO')),
    }),
    thumbnailUrl: t.string({
      nullable: true,
      args: {
        resize: t.arg({
          required: false,
          type: ResizeParams,
        }),
        quality: t.arg.int({ required: false }),
      },
      select: { defaultThumbnailPath: true, overrideThumbnailPath: true },
      resolve: ({ defaultThumbnailPath, overrideThumbnailPath }, args) => {
        const from = overrideThumbnailPath ?? defaultThumbnailPath;

        if (!from) {
          return null;
        }

        return getPublicImageUrl(getS3ProtocolUri('PUBLIC', from), args);
      },
    }),
    thumbnailBlurhash: t.exposeString('defaultThumbnailBlurhash', {
      nullable: true,
    }),
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
    uploadFinalizedAt: t.field({
      type: 'DateTime',
      nullable: true,
      authScopes: internalAuthScopes,
      select: {
        uploadFinalizedAt: true,
      },
      resolve: ({ uploadFinalizedAt }) => uploadFinalizedAt?.toISOString(),
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

        const ses = context.session;

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
        const userId = context.session?.appUserId;

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
    podcastSource: t.string({
      select: { variants: true },
      resolve: async (root) => {
        const variant = root.variants.find((v) => v === 'AUDIO_DOWNLOAD');
        invariant(variant, 'No audio download variant found');
        return getPublicMediaUrl(`${root.id}/AUDIO_DOWNLOAD.m4a`);
      },
    }),
    podcastSizeBytes: t.field({
      type: 'SafeInt',
      select: { downloadSizes: true },
      resolve: async (root) => {
        const size = root.downloadSizes.find(
          (v) => v.variant === 'AUDIO_DOWNLOAD',
        );
        invariant(size, 'No audio download variant found');
        return Number(size.bytes.valueOf());
      },
    }),
    peaksDatUrl: t.string({
      nullable: true,
      select: { id: true, variants: true },
      resolve: async (root, _args, _context) => {
        if (!root.variants.includes('AUDIO')) {
          return null;
        }

        return getPublicMediaUrl(`${root.id}/peaks.dat`);
      },
    }),
    peaksJsonUrl: t.string({
      nullable: true,
      select: { id: true, variants: true },
      resolve: async (root, _args, _context) => {
        if (!root.variants.includes('AUDIO')) {
          return null;
        }

        return getPublicMediaUrl(`${root.id}/peaks.json`);
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
                  'AUDIO',
                  'TRANSCRIPT_VTT',
                  'TRANSCRIPT_TXT',
                ] as const,
              }),
            }),
            label: f.string(),
            url: f.string(),
          }),
        }),
      ],
      select: { id: true, variants: true, title: true },
      resolve: async (root) => {
        type MediaDownloadKind =
          | 'VIDEO_4K'
          | 'VIDEO_1080P'
          | 'VIDEO_720P'
          | 'VIDEO_480P'
          | 'AUDIO'
          | 'TRANSCRIPT_VTT'
          | 'TRANSCRIPT_TXT';
        const media = await Promise.all(
          root.variants
            // TODO: remove 360P, see ffmpeg.ts
            .filter((v) => v.endsWith('_DOWNLOAD') && !v.includes('360P'))
            .map(async (v) => {
              const ext = v.startsWith('VIDEO') ? 'mp4' : 'm4a';
              return {
                kind: (v === 'VIDEO_4K_DOWNLOAD'
                  ? 'VIDEO_4K'
                  : v === 'VIDEO_1080P_DOWNLOAD'
                  ? 'VIDEO_1080P'
                  : v === 'VIDEO_720P_DOWNLOAD'
                  ? 'VIDEO_720P'
                  : v === 'VIDEO_480P'
                  ? 'VIDEO_480P'
                  : 'AUDIO') as MediaDownloadKind,
                label:
                  v === 'VIDEO_4K_DOWNLOAD'
                    ? '4k Video'
                    : v === 'VIDEO_1080P_DOWNLOAD'
                    ? '1080p Video'
                    : v === 'VIDEO_720P_DOWNLOAD'
                    ? '720p Video'
                    : v === 'VIDEO_480P'
                    ? '480p Video'
                    : 'Audio',
                url: await getPublicUrlWithFilename(
                  `${root.id}/${v}.${ext}`,
                  `${root.title ?? root.id}.${ext}`,
                ),
              };
            }),
        );

        return media.concat([
          {
            kind: 'TRANSCRIPT_VTT',
            label: 'Transcript (vtt)',
            url: await getPublicUrlWithFilename(
              `${root.id}/transcript.vtt`,
              `${root.title ?? root.id}.vtt`,
            ),
          },
          {
            kind: 'TRANSCRIPT_TXT',
            label: 'Transcript (txt)',
            url: await getPublicUrlWithFilename(
              `${root.id}/transcript.original.txt`,
              `${root.title ?? root.id}.txt`,
            ),
          },
        ]);
      },
    }),
    series: t.connection({
      type: UploadList,
      select: { id: true },
      resolve: (root, args, context, info) =>
        resolveOffsetConnection({ args }, async ({ offset, limit }) =>
          prisma.uploadList.findMany({
            ...queryFromInfo({ context, info, path: ['edges', 'node'] }),
            skip: offset,
            take: limit,
            where: {
              type: UploadListType.SERIES,
              uploads: { some: { uploadRecordId: root.id } },
            },
          }),
        ),
    }),
    playlists: t.connection({
      type: UploadList,
      select: { id: true },
      resolve: (root, args, context, info) =>
        resolveOffsetConnection({ args }, async ({ offset, limit }) => {
          const userId = context.session?.appUserId;

          if (!userId) {
            return [];
          }

          return prisma.uploadList.findMany({
            ...queryFromInfo({ context, info, path: ['edges', 'node'] }),
            skip: offset,
            take: limit,
            where: {
              type: UploadListType.PLAYLIST,
              authorId: userId,
              uploads: { some: { uploadRecordId: root.id } },
            },
          });
        }),
    }),
    totalViews: t.relationCount('uploadViews'),
    uploadListById: t.prismaField({
      type: UploadList,
      nullable: true,
      args: { id: t.arg({ type: 'ShortUuid', required: false }) },
      resolve: (query, root, { id }) =>
        id
          ? prisma.uploadList.findUnique({
              ...query,
              where: { id, uploads: { some: { uploadRecordId: root.id } } },
            })
          : null,
    }),
  }),
});

const UploadListTypeEnum = builder.enumType('UploadListType', {
  values: Object.keys(UploadListType),
});

const UploadListEntry = builder.prismaObject('UploadListEntry', {
  fields: (t) => ({
    uploadList: t.relation('uploadList'),
    upload: t.relation('upload'),
    rank: t.exposeString('rank'),
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
      const userId = context.session?.appUserId;

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
            transcodingFinishedAt: { not: null },
            transcribingFinishedAt: { not: null },
            channel: {
              subscribers: {
                some: {
                  appUserId: userId,
                },
              },
            },
            visibility: PrismaUploadVisibility.PUBLIC,
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
        typeName: 'UploadRecord',
      });

      return resolveOffsetConnection({ args }, async ({ offset, limit }) => {
        return prisma.uploadRecord.findMany({
          ...query,
          skip: offset,
          take: limit,
          where: {
            transcribingFinishedAt: { not: null },
            transcodingFinishedAt: { not: null },
            visibility: 'PUBLIC',
            channel: {
              visibility: 'PUBLIC',
            },
          },
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
  uploadListById: t.prismaField({
    type: UploadList,
    args: { id: t.arg({ type: 'ShortUuid', required: true }) },
    resolve: (query, _root, { id }) =>
      prisma.uploadList.findUniqueOrThrow({ ...query, where: { id } }),
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
      const userId = context.session?.appUserId;

      if (!userId) {
        return false;
      }

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
      const userId = context.session?.appUserId;
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
      const userId = context.session?.appUserId;

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
      const userId = context.session?.appUserId;
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
      const userId = context.session?.appUserId;
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
      const userId = context.session?.appUserId;

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
        session?.appUserId ?? clientIp + clientUserAgent,
        res.salt,
      );

      await prisma.uploadView.upsert({
        where: { uploadRecordId_viewHash: { uploadRecordId, viewHash } },
        create: {
          uploadRecordId,
          viewHash,
          appUserId: session?.appUserId ?? null,
        },
        update: { count: { increment: 1 } },
      });

      return true;
    },
  }),
  recordUploadRangesView: t.field({
    type: 'Uuid',
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
      ranges: t.arg({
        type: [
          builder.inputType('TimeRange', {
            fields: (f) => ({
              start: f.float({ required: true }),
              end: f.float({ required: true }),
            }),
          }),
        ],
        required: true,
      }),
      viewId: t.arg({ type: 'Uuid', required: false }),
    },
    resolve: async (
      _root,
      { uploadRecordId, ranges, viewId },
      { clientIp, clientUserAgent, session },
    ) => {
      const res = await prisma.trackingSalt.findFirst({
        orderBy: { id: 'desc' },
      });

      invariant(res, 'Missing tracking salt');
      invariant(clientUserAgent, 'Missing client user agent');

      const totalTime = ranges.reduce(
        (sum, range) => sum + (range.end - range.start),
        0,
      );

      if (viewId) {
        // Given a viewId, update it directly (since the view hash can change when the day turns)
        await prisma.uploadViewRanges.update({
          where: { id: viewId },
          data: { ranges, totalTime },
        });

        return viewId;
      }

      // The viewer hash will change once daily since the salt changes once daily, this means that each user can count for one view per day
      const viewHash = xxh32(
        session?.appUserId ?? `${clientIp}${clientUserAgent}`,
        res.salt,
      );

      // Refreshing can cause duplicate views, but as long as viewing time is not overridden then that's okay
      const { id } = await prisma.uploadViewRanges.create({
        select: {
          id: true,
        },
        data: {
          uploadRecordId,
          viewHash,
          appUserId: session?.appUserId ?? null,
          ranges,
          totalTime,
        },
      });

      return id;
    },
  }),
  createUploadList: t.prismaField({
    type: UploadList,
    args: {
      type: t.arg({ type: UploadListTypeEnum, required: true }),
      title: t.arg({ type: 'String', required: true }),
      channelId: t.arg({ type: 'ShortUuid' }),
    },
    validate: {
      schema: z.object({ title: z.string() }).and(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal(UploadListType.PLAYLIST) }),
          z.object({
            type: z.literal(UploadListType.SERIES),
            channelId: z.string().uuid(),
          }),
        ]),
      ),
    },
    authScopes: async (_root, { type, channelId }, context) => {
      if (type === UploadListType.PLAYLIST) {
        return { authenticated: true };
      }

      invariant(channelId, 'No channel id');
      const userId = context.session?.appUserId;
      invariant(userId, 'No user id');

      const membership = await prisma.channelMembership.findFirst({
        select: { isAdmin: true, canEdit: true },
        where: { channelId, appUserId: userId },
      });

      return Boolean(membership?.isAdmin || membership?.canEdit);
    },
    resolve: async (query, _root, { type, title }, context) => {
      const userId = context.session?.appUserId;
      invariant(userId, 'No user id!');

      return prisma.uploadList.create({
        ...query,
        data: {
          type:
            type === 'PLAYLIST'
              ? UploadListType.PLAYLIST
              : UploadListType.SERIES,
          title,
          author: {
            connect: { id: userId },
          },
        },
      });
    },
  }),
  addUploadToList: t.prismaField({
    type: UploadList,
    args: {
      uploadListId: t.arg({ type: 'ShortUuid', required: true }),
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
      before: t.arg({ type: 'ShortUuid' }),
      after: t.arg({ type: 'ShortUuid' }),
    },
    authScopes: async (_root, { uploadListId }, context) => {
      const userId = context.session?.appUserId;

      if (!userId) {
        return false;
      }

      const res = await prisma.uploadList.findFirst({
        select: { type: true, authorId: true, channelId: true },
        where: { id: uploadListId },
      });

      if (res?.type === UploadListType.PLAYLIST) {
        return res.authorId === userId;
      }

      if (res?.type === UploadListType.SERIES && res?.channelId) {
        const membership = await prisma.channelMembership.findFirst({
          select: { isAdmin: true, canEdit: true },
          where: { channelId: res.channelId, appUserId: userId },
        });

        return Boolean(membership?.isAdmin || membership?.canEdit);
      }

      return false;
    },
    resolve: async (
      query,
      _root,
      { uploadListId, uploadRecordId, after, before },
    ) => {
      let newRank: string | undefined;

      if (before || after) {
        // Case 1: inserting before or after a given upload
        const { rank } = await prisma.uploadListEntry.findUniqueOrThrow({
          where: {
            uploadListId_uploadRecordId: { uploadListId, uploadRecordId },
          },
        });

        const entries = await prisma.uploadListEntry.findMany({
          skip: 0, // Cursor is not skipped by default, this makes it explicit
          take: 2,
          select: { rank: true },
          cursor: { uploadListId_rank: { uploadListId, rank } },
          orderBy: {
            rank: before ? Prisma.SortOrder.desc : Prisma.SortOrder.asc,
          },
        });

        const entry = entries.at(-1);

        if (entry && entries.length > 1) {
          newRank = LexoRank.parse(rank)
            .between(LexoRank.parse(entry.rank))
            .toString();
        }

        if (entries.length === 1) {
          newRank = LexoRank.parse(rank)
            .between(before ? LexoRank.min() : LexoRank.max())
            .toString();
        }
      }

      if (!newRank) {
        // Case 2: inserting at the end of a list
        const rank = (
          await prisma.uploadListEntry.findMany({
            select: { rank: true },
            where: { uploadListId },
            orderBy: { rank: Prisma.SortOrder.desc },
            take: 1,
          })
        ).at(0)?.rank;

        if (rank) {
          newRank = LexoRank.parse(rank).between(LexoRank.max()).toString();
        } else {
          // Case 3: no existing list entries
          newRank = LexoRank.middle().toString();
        }
      }

      await prisma.uploadListEntry.create({
        data: {
          uploadList: { connect: { id: uploadListId } },
          upload: { connect: { id: uploadRecordId } },
          rank: newRank,
        },
      });

      return prisma.uploadList.findUniqueOrThrow({
        ...query,
        where: { id: uploadListId },
      });
    },
  }),
}));
