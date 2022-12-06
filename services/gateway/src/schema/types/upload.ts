import invariant from 'tiny-invariant';
import {
  createMultipartUpload,
  createPresignedPartUploadUrls,
  createPresignedUploadUrl,
  PART_SIZE,
} from '../../util/s3';
import {
  completeMultipartMediaUpload,
  handleMultipartMediaUpload,
} from '../../temporal';
import builder from '../builder';
import { databaseTranscriptSchema } from '../../util/zod';

builder.prismaObject('UploadRecord', {
  authScopes: async (uploadRecord, context) => {
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
  },
  select: {
    id: true,
    channelId: true, // For authScopes
  },
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    createdBy: t.relation('createdBy'),
    uploadFinalizedBy: t.relation('uploadFinalizedBy'),
    channel: t.relation('channel'),
    uploadSizeBytes: t.string({
      nullable: true,
      select: {
        uploadSizeBytes: true,
      },
      resolve: ({ uploadSizeBytes }) => uploadSizeBytes?.toString(),
    }),
    uploadFinalized: t.exposeBoolean('uploadFinalized'),
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
    transcriptSentences: t.field({
      type: [
        builder.simpleObject('TranscriptSentence', {
          fields: (tst) => ({
            text: tst.string(),
            start: tst.int(),
            end: tst.int(),
            confidence: tst.float(),
          }),
        }),
      ],
      nullable: true,
      select: { transcriptSentences: true },
      resolve: ({ transcriptSentences }) =>
        transcriptSentences
          ? databaseTranscriptSchema.parse(transcriptSentences)
          : null,
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
      { uploadRecordId, title = null, description = null, channelId },
      context,
    ) => {
      const userId = (await context.session)?.appUserId;
      invariant(userId, 'No user found!');

      if (uploadRecordId) {
        return context.prisma.uploadRecord.update({
          ...query,
          where: { id: uploadRecordId },
          data: {
            title,
            description,
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
      bytes: t.arg.int({ required: true }),
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
        uploadRecordId,
        uploadMimeType,
      );

      await handleMultipartMediaUpload(uploadKey, uploadId);

      const urls = await createPresignedPartUploadUrls(
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
      createPresignedUploadUrl(`${uploadRecordId}-thumbnail`, uploadMimeType),
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
