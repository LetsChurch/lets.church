import invariant from 'tiny-invariant';
import {
  UploadLicense as PrismaUploadLicense,
  UploadVisibility as PrismaUploadVisibility,
  UploadVariant as PrismaUploadVariant,
} from '@prisma/client';
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

builder.prismaObject('UploadRecord', {
  select: {
    id: true,
    channelId: true, // For authScopes
  },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    title: t.exposeString('title', { nullable: true }),
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
        type: builder.enumType('Rating', {
          values: ['LIKE', 'DISLIKE'] as const,
        }),
        required: true,
      }),
    },
    authScopes: { authenticated: true },
    resolve: async (_root, { uploadRecordId, rating }, context, _info) => {
      const userId = (await context.session)?.appUserId;

      if (!userId) {
        return false;
      }

      await prisma.$transaction(async (tx) => {
        // 1. Get existing rating
        const existing = await tx.uploadUserRating.findFirst({
          where: { userId, uploadRecordId, rating },
        });
        // 2. Delete any existing rating
        await tx.uploadUserRating.deleteMany({
          where: {
            userId: userId,
            uploadRecordId: uploadRecordId,
          },
        });
        // 3. If the new rating is different from any existing rating, create it
        if (existing?.rating !== rating) {
          await tx.uploadUserRating.create({
            data: { userId, uploadRecordId, rating },
          });
        }
      });

      return true;
    },
  }),
}));
