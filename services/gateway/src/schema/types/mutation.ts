import invariant from 'tiny-invariant';
import {
  completeMultipartMediaUpload,
  handleMultipartMediaUpload,
} from '../../temporal';
import prisma from '../../util/prisma';
import {
  createMultipartUpload,
  createPresignedPartUploadUrls,
  PART_SIZE,
} from '../../util/s3';
import builder from '../builder';

const uploadPostProcessValues = [
  'media',
  'thumbnail',
  'profileAvatar',
  'channelAvatar',
] as const;

export type UploadPostProcessValue = (typeof uploadPostProcessValues)[number];

const UploadPostProcess = builder.enumType('UploadPostProcess', {
  values: uploadPostProcessValues,
});

builder.mutationType({
  fields: (t) => ({
    createMultipartUpload: t.field({
      type: builder.simpleObject('MultipartUploadMeta', {
        fields: (sot) => ({
          s3UploadKey: sot.string(),
          s3UploadId: sot.string(),
          partSize: sot.int(),
          urls: sot.stringList(),
        }),
      }),
      args: {
        targetId: t.arg({ type: 'ShortUuid', required: true }),
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
      authScopes: async (_root, { postProcess, targetId }, { session }) => {
        if (postProcess === 'media') {
          const record = await prisma.uploadRecord.findFirst({
            where: {
              id: targetId,
              uploadFinalized: false,
              channel: {
                memberships: {
                  some: {
                    appUserId: targetId,
                    OR: [{ isAdmin: true }, { canUpload: true }],
                  },
                },
              },
            },
            select: { uploadFinalized: true },
          });

          if (record && record.uploadFinalized) {
            throw new Error('Upload is already finalized!');
          }

          if (!record) {
            return { admin: true };
          }
        }

        if (postProcess === 'profileAvatar') {
          if (session?.appUser.id !== targetId) {
            return { admin: true };
          }
        }

        return { authenticated: true };
      },
      resolve: async (
        _root,
        { targetId, uploadMimeType, bytes, postProcess },
        _context,
      ) => {
        const { uploadKey, uploadId } = await createMultipartUpload(
          'INGEST',
          targetId,
          uploadMimeType,
        );

        await handleMultipartMediaUpload(
          targetId,
          'INGEST',
          uploadId,
          uploadKey,
          postProcess,
        );

        const urls = await createPresignedPartUploadUrls(
          'INGEST',
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
    finalizeMultipartUpload: t.boolean({
      args: {
        targetId: t.arg({ type: 'ShortUuid', required: true }),
        s3UploadId: t.arg.string({ required: true }),
        s3UploadKey: t.arg.string({ required: true }),
        s3PartETags: t.arg.stringList({ required: true }),
      },
      authScopes: async () => {
        return { authenticated: true };
      },
      resolve: async (
        _root,
        { s3UploadId, s3UploadKey, s3PartETags },
        context,
        _info,
      ) => {
        const userId = context.session?.appUserId;
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
  }),
});
