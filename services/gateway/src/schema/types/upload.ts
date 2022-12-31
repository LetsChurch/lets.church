import invariant from 'tiny-invariant';
import {
  UploadLicense as PrismaUploadLicense,
  UploadVisibility as PrismaUploadVisibility,
} from '@prisma/client';
import {
  createMultipartUpload,
  createPresignedPartUploadUrls,
  createPresignedUploadUrl,
  PART_SIZE,
  S3_INGEST_BUCKET,
} from '../../util/s3';
import {
  completeMultipartMediaUpload,
  handleMultipartMediaUpload,
} from '../../temporal';
import builder from '../builder';
import type { Context } from '../../util/context';

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
  const membership = await context.prisma.channelMembership.findUnique({
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
    resolve: (query, _root, { id }, { prisma }) =>
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
      const membership = await context.prisma.channelMembership.findUnique({
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
        return context.prisma.uploadRecord.update({
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
      }

      return context.prisma.uploadRecord.create({
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
    },
    resolve: async (
      _root,
      { uploadRecordId, uploadMimeType, bytes },
      { prisma },
    ) => {
      const { uploadFinalized } = await prisma.uploadRecord.findUniqueOrThrow({
        where: { id: uploadRecordId },
        select: { uploadFinalized: true },
      });

      invariant(!uploadFinalized, 'Upload is already finalized!');

      const { uploadKey, uploadId } = await createMultipartUpload(
        S3_INGEST_BUCKET,
        uploadRecordId,
        uploadMimeType,
      );

      await handleMultipartMediaUpload(S3_INGEST_BUCKET, uploadKey, uploadId);

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
  thumbnailUploadUrl: t.string({
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
      uploadMimeType: t.arg.string({ required: true }),
    },
    resolve: (_root, { uploadRecordId, uploadMimeType }) =>
      createPresignedUploadUrl(
        S3_INGEST_BUCKET,
        `${uploadRecordId}-thumbnail`,
        uploadMimeType,
      ),
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

      const record = await context.prisma.uploadRecord.findFirst({
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
      { uploadRecordId, s3UploadId, s3UploadKey, s3PartETags },
      context,
      _info,
    ) => {
      const userId = (await context.session)?.appUserId;
      invariant(userId, 'No user found!');

      await completeMultipartMediaUpload(s3UploadKey, s3UploadId, s3PartETags);

      await context.prisma.$transaction(async (tx) => {
        await tx.uploadRecord.update({
          data: {
            uploadFinalized: true,
            uploadFinalizedBy: {
              connect: {
                id: userId,
              },
            },
          },
          where: { id: uploadRecordId },
        });
      });

      return true;
    },
  }),
}));
