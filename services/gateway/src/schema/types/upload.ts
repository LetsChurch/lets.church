import invariant from 'tiny-invariant';
import {
  UploadLicense as PrismaUploadLicense,
  UploadVisibility as PrismaUploadVisibility,
  UploadVariant as PrismaUploadVariant,
  Rating as PrismaRating,
  Prisma,
} from '@prisma/client';
import envariant from '@knpwrs/envariant';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import {
  createMultipartUpload,
  createPresignedGetUrl,
  createPresignedPartUploadUrls,
  PART_SIZE,
  S3_INGEST_BUCKET,
  S3_PUBLIC_BUCKET,
} from '../../util/s3';
import {
  completeMultipartMediaUpload,
  handleMultipartMediaUpload,
  indexDocument,
} from '../../temporal';
import builder from '../builder';
import type { Context } from '../../util/context';
import prisma from '../../util/prisma';

const MEDIA_URL = envariant('MEDIA_URL');

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

const UploadPostProcess = builder.enumType('UploadPostProcess', {
  values: ['media', 'thumbnail'] as const,
});

builder.prismaObject('UploadUserComment', {
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

builder.prismaObject('UploadRecord', {
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

        return createPresignedGetUrl(S3_PUBLIC_BUCKET, defaultThumbnailPath);
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
          const url = new URL(MEDIA_URL);
          url.pathname = `${id}.vtt`;
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
    userComments: t.relatedConnection('userComments', {
      cursor: 'id',
      totalCount: true,
      query: {
        orderBy: { createdAt: Prisma.SortOrder.desc },
        where: { replyingTo: null },
      },
    }),
    mediaSource: t.string({
      nullable: true,
      select: { id: true, variants: true },
      resolve: async (root, _args, _context) => {
        if (root.variants.filter((v) => v !== 'AUDIO').length === 0) {
          return null;
        }

        const url = new URL(MEDIA_URL);
        url.pathname = `${root.id}/master.m3u8`;
        return url.toString();
      },
    }),
    audioSource: t.string({
      nullable: true,
      select: { id: true, variants: true },
      resolve: async (root, _args, _context) => {
        if (!root.variants.includes('AUDIO')) {
          return null;
        }

        const url = new URL(MEDIA_URL);
        url.pathname = `${root.id}/audio.m3u8`;
        return url.toString();
      },
    }),
  }),
});

builder.queryFields((t) => ({
  uploadRecordById: t.prismaField({
    type: 'UploadRecord',
    args: {
      id: t.arg({ type: 'ShortUuid', required: true }),
    },
    resolve: (query, _root, { id }, _context) =>
      prisma.uploadRecord.findUniqueOrThrow({ ...query, where: { id } }),
  }),
}));

builder.mutationFields((t) => ({
  upsertUploadRecord: t.prismaField({
    type: 'UploadRecord',
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid' }),
      title: t.arg.string(),
      description: t.arg.string(),
      publishedAt: t.arg({ type: 'DateTime', required: true }),
      license: t.arg({ type: UploadLicense, required: true }),
      visibility: t.arg({ type: UploadVisibility, required: true }),
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
  createMultipartMediaUpload: t.field({
    type: builder.simpleObject('MultipartUploadMeta', {
      fields: (sot) => ({
        s3UploadKey: sot.string(),
        s3UploadId: sot.string(),
        partSize: sot.int(),
        urls: sot.stringList(),
      }),
    }),
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
      bytes: t.arg({
        type: 'SafeInt',
        required: true,
        validate: {
          min: 0, // i.e., Positive; should we really allow the API to take an upload size of 0?
          max: 20e9, // i.e., 20 GB, reasonably large upper limit
        },
      }),
      uploadMimeType: t.arg.string({ required: true }),
      postProcess: t.arg({ type: UploadPostProcess, required: true }),
    },
    resolve: async (
      _root,
      { uploadRecordId, uploadMimeType, bytes, postProcess },
      _context,
    ) => {
      const { uploadFinalized } = await prisma.uploadRecord.findUniqueOrThrow({
        where: { id: uploadRecordId },
        select: { uploadFinalized: true },
      });

      if (uploadFinalized && postProcess === 'media') {
        throw new Error('Upload is already finalized!');
      }

      const { uploadKey, uploadId } = await createMultipartUpload(
        S3_INGEST_BUCKET,
        uploadRecordId,
        uploadMimeType,
      );

      await handleMultipartMediaUpload(
        uploadRecordId,
        S3_INGEST_BUCKET,
        uploadId,
        uploadKey,
        postProcess,
      );

      const urls = await createPresignedPartUploadUrls(
        S3_INGEST_BUCKET,
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
    },
  }),
  finalizeUpload: t.boolean({
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
      s3UploadId: t.arg.string({ required: true }),
      s3UploadKey: t.arg.string({ required: true }),
      s3PartETags: t.arg.stringList({ required: true }),
    },
    authScopes: async (_root, args, context) => {
      const userId = (await context.session)?.appUserId;

      if (!userId) {
        return false;
      }

      const record = await prisma.uploadRecord.findFirst({
        where: {
          id: args.uploadRecordId,
          uploadFinalized: false,
          channel: {
            memberships: {
              some: {
                appUserId: userId,
                OR: [{ isAdmin: true }, { canUpload: true }],
              },
            },
          },
        },
      });

      if (!record) {
        return { admin: true };
      }

      return true;
    },
    resolve: async (
      _root,
      { s3UploadId, s3UploadKey, s3PartETags },
      context,
      _info,
    ) => {
      const userId = (await context.session)?.appUserId;
      invariant(userId, 'No user found!');

      await completeMultipartMediaUpload(
        s3UploadId,
        s3UploadKey,
        s3PartETags,
        userId,
      );

      return true;
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
    type: 'UploadUserComment',
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
      replyingTo: t.arg({ type: 'ShortUuid', required: false }),
      commentId: t.arg({ type: 'ShortUuid', required: false }),
      text: t.arg.string({ required: true }),
    },
    authScopes: async (_root, { commentId }, context) => {
      const userId = (await context.session)?.appUserId;
      invariant(userId, 'No user found!');

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
}));
