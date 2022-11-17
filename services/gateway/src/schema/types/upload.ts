import invariant from 'tiny-invariant';
import { createPresignedUploadUrl, headObject } from '../../util/s3';
import { processUpload } from '../../temporal';
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
    uploader: t.relation('uploader'),
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
    uploadUrl: t.string({
      select: {
        id: true,
        uploadMimeType: true,
        uploadFinalized: true,
      },
      authScopes: (root) => !root.uploadFinalized,
      resolve: ({ id, uploadMimeType }) =>
        createPresignedUploadUrl(id, uploadMimeType),
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
  createUploadRecord: t.prismaField({
    type: 'UploadRecord',
    args: {
      channelId: t.arg({ type: 'ShortUuid', required: true }),
      uploadMimeType: t.arg.string({ required: true }),
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
    resolve: async (query, _root, { channelId, uploadMimeType }, context) => {
      const userId = (await context.session)?.appUserId;
      invariant(userId, 'No user found!');

      return context.prisma.uploadRecord.create({
        ...query,
        data: {
          uploadMimeType,
          uploader: {
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
  finalizeUpload: t.boolean({
    args: {
      uploadRecordId: t.arg({ type: 'ShortUuid', required: true }),
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
    resolve: async (_root, { uploadRecordId }, context, _info) => {
      const res = await headObject(uploadRecordId);

      if (!res?.ETag) {
        return false;
      }

      await context.prisma.$transaction(async (tx) => {
        await tx.uploadRecord.update({
          data: { uploadFinalized: true },
          where: { id: uploadRecordId },
        });

        await processUpload(uploadRecordId);
      });

      return true;
    },
  }),
}));
