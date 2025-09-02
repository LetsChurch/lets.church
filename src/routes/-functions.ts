import { createMiddleware, createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import {
  completeMultipartMediaUpload,
  handleMultipartMediaUpload,
} from '@/temporal';
import { getSession } from '@/util/auth';
import db from '@/util/db';
import {
  createMultipartUpload,
  createPresignedPartUploadUrls,
  PART_SIZE,
} from '@/util/s3';
import { uploadPostProcessValues } from '@/util/types';

export const sessionMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await getSession();

    const safeSession = session
      ? {
          id: session.id,
          expiresAt: session.expiresAt,
          appUser: {
            id: session.appUser.id,
            role: session.appUser.role,
          },
        }
      : null;

    return next({
      context: {
        session: safeSession,
      },
    });
  },
);

const clientEnv = z
  .object({ TURNSTILE_SITE_KEY: z.string() })
  .parse(process.env);

export const getClientEnv = createServerFn({
  method: 'GET',
  response: 'data',
}).handler(() => clientEnv);

export const hasValidSession = createServerFn({
  method: 'GET',
  response: 'data',
})
  .middleware([sessionMiddleware])
  .handler(async ({ context }): Promise<boolean> => {
    return Boolean(context.session);
  });

export const requireAnonMiddleware = createMiddleware({
  type: 'function',
})
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (context.session) {
      throw new Response('Unauthorized', { status: 401 });
    }

    return next();
  });

export const requireAuthMiddleware = createMiddleware({
  type: 'function',
})
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    if (!context.session) {
      throw new Response('Unauthorized', { status: 401 });
    }

    return next();
  });

export const requireChannelUploadAccessMiddleware = createMiddleware({
  type: 'function',
})
  .middleware([sessionMiddleware])
  .validator(z.looseObject({ channelId: z.uuid() }))
  .server(async ({ next, context, data: { channelId } }) => {
    if (!context.session) {
      throw new Response('Unauthorized', { status: 401 });
    }

    const membership = await db.channelMembership.findFirst({
      where: {
        channelId,
        appUserId: context.session.appUser.id,
      },
      select: {
        isAdmin: true,
        canUpload: true,
      },
    });

    if (
      !(
        membership?.isAdmin ||
        membership?.canUpload ||
        context.session.appUser.role === 'ADMIN'
      )
    ) {
      throw new Response('Forbidden', { status: 403 });
    }

    return next();
  });

export const requireChannelUploadEditAccessMiddleware = createMiddleware({
  type: 'function',
})
  .middleware([sessionMiddleware])
  .validator(z.looseObject({ channelId: z.uuid() }))
  .server(async ({ next, context, data: { channelId } }) => {
    if (!context.session) {
      throw new Response('Unauthorized', { status: 401 });
    }

    const membership = await db.channelMembership.findFirst({
      where: {
        channelId,
        appUserId: context.session.appUser.id,
      },
      select: {
        isAdmin: true,
        canUpload: true,
        canEdit: true,
      },
    });

    if (
      !(
        membership?.isAdmin ||
        membership?.canUpload ||
        membership?.canEdit ||
        context.session.appUser.role === 'ADMIN'
      )
    ) {
      throw new Response('Forbidden', { status: 403 });
    }

    return next();
  });

export const requireChannelAdminAccessMiddleware = createMiddleware({
  type: 'function',
})
  .middleware([sessionMiddleware])
  .validator(z.looseObject({ channelId: z.string() }))
  .server(async ({ next, context, data: { channelId } }) => {
    if (!context.session) {
      throw new Response('Unauthorized', { status: 401 });
    }

    const membership = await db.channelMembership.findFirst({
      where: {
        channelId,
        appUserId: context.session.appUser.id,
      },
      select: {
        isAdmin: true,
      },
    });

    if (!(membership?.isAdmin || context.session.appUser.role === 'ADMIN')) {
      throw new Response('Forbidden', { status: 403 });
    }

    return next();
  });

export const clientCreateMultipartUpload = createServerFn({
  method: 'POST',
  response: 'data',
})
  .middleware([requireChannelUploadAccessMiddleware])
  .validator(
    z.looseObject({
      targetId: z.string(),
      uploadMimeType: z.string(),
      postProcess: z.enum(uploadPostProcessValues),
      bytes: z.number(),
    }),
  )
  .handler(
    async ({ data: { targetId, uploadMimeType, postProcess, bytes } }) => {
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
  );

export const clientFinalizeMultipartUpload = createServerFn({
  method: 'POST',
  response: 'data',
})
  .middleware([requireChannelUploadAccessMiddleware])
  .validator(
    z.looseObject({
      s3UploadId: z.string(),
      s3UploadKey: z.string(),
      s3PartETags: z.array(z.string()),
    }),
  )
  .handler(
    async ({ context, data: { s3UploadId, s3UploadKey, s3PartETags } }) => {
      const userId = context.session?.appUser.id;
      invariant(userId, 'No user found');
      await completeMultipartMediaUpload(
        s3UploadId,
        s3UploadKey,
        s3PartETags,
        userId,
      );

      return true;
    },
  );
