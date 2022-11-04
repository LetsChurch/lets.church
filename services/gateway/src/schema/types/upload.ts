import invariant from 'tiny-invariant';
import {
  createPresignedGetUrl,
  createPresignedUploadUrl,
  headObject,
} from '../../util/s3';
import { processUpload } from '../../util/temporal';
import builder from '../builder';

builder.prismaObject('UploadRecord', {
  authScopes: async (uploadRecord, context) => {
    const userId = (await context.identity)?.id;

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
  fields: (t) => ({
    id: t.expose('id', { type: 'ShortUuid' }),
    uploader: t.relation('uploader'),
    channel: t.relation('channel'),
    uploadSizeBytes: t.string({
      nullable: true,
      resolve: ({ uploadSizeBytes }) => uploadSizeBytes?.toString(),
    }),
    uploadFinalized: t.exposeBoolean('uploadFinalized'),
    createdAt: t.field({
      type: 'DateTime',
      resolve: ({ createdAt }) => createdAt.toISOString(),
    }),
    updatedAt: t.field({
      type: 'DateTime',
      resolve: ({ updatedAt }) => updatedAt.toISOString(),
    }),
    uploadUrl: t.string({
      select: {
        id: true,
        uploadFinalized: true,
      },
      authScopes: (root) => !root.uploadFinalized,
      resolve: ({ id, uploadMimeType }) =>
        createPresignedUploadUrl(id, uploadMimeType),
    }),
  }),
});

builder.mutationFields((t) => ({
  createUploadRecord: t.prismaField({
    type: 'UploadRecord',
    args: {
      channelId: t.arg({ type: 'ShortUuid', required: true }),
      uploadMimeType: t.arg.string({ required: true }),
    },
    authScopes: async (_root, args, context) => {
      const userId = (await context.identity)?.id;

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
      const identity = await context.identity;
      invariant(identity, 'No user found!');

      return context.prisma.uploadRecord.create({
        ...query,
        data: {
          uploadMimeType,
          uploader: {
            connect: {
              id: identity.id,
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
      const userId = (await context.identity)?.id;

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

        await processUpload(
          uploadRecordId,
          await createPresignedGetUrl(uploadRecordId),
        );
      });

      return true;
    },
  }),
}));
