import { db } from '@letschurch/db';
import {
  STUDY_GUIDE_MIN_SECONDS,
  STUDY_GUIDE_VERSION,
} from '@letschurch/temporal/util/study-guide';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { enforceAiRateLimit } from '@/ai/abuse-control';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import {
  getStudyGuideWorkflowState,
  startGenerateStudyGuide,
} from '@/temporal';
import type { Context } from '@/trpc/context';
import logger from '@/util/logger';
import { canViewMediaById } from '@/util/media-visibility';
import { consumeTokenBucketWithFallback } from '@/util/rate-limit';

import { publicProcedure, router } from '../trpc';

const moduleLogger = logger.child({ module: 'trpc/procedures/study-guide' });

// Generating a guide is one LLM call a viewer can trigger without signing in.
// Guides are cached per upload, so only first requests cost anything. Each
// start is charged to the shared AI quota (docs/security.md §6), and a
// site-wide daily cap bounds the total however many networks are involved.
const GLOBAL_BUCKET = {
  key: 'study-guide:global',
  capacity: 300,
  refillTokensPerSecond: 300 / 86_400,
};

export type StudyGuideStatus =
  | { status: 'ready'; url: string }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'none' };

const inputSchema = z.object({ mediaId: IncomingIdSchema });

export function studyGuideUrl(uploadRecordId: string): string {
  return `/media/${OutgoingIdSchema.parse(uploadRecordId)}/study-guide.pdf`;
}

/**
 * Whether the upload exists, is viewable, allows downloads, is long enough,
 * and has finished its transcript pipeline. Summarize runs after annotation (outline and
 * Scripture links) and skips uploads with no paragraphs, so a summary means
 * the guide has everything it draws on.
 */
async function assertGuideable(
  mediaId: string,
  ctx: Parameters<typeof canViewMediaById>[1],
) {
  if (!(await canViewMediaById(mediaId, ctx))) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  const upload = await db.query.UploadRecord.findFirst({
    columns: {
      summarizedAt: true,
      lengthSeconds: true,
      downloadsEnabled: true,
    },
    where: (t, { eq }) => eq(t.id, mediaId),
  });
  // The guide is a download of the transcript's content, so it follows the
  // upload's downloads setting like the transcript downloads do.
  if (upload && !upload.downloadsEnabled) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Downloads are turned off for this media.',
    });
  }
  if (!upload?.summarizedAt) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'This media isn’t ready for a study guide yet.',
    });
  }
  if ((upload.lengthSeconds ?? 0) < STUDY_GUIDE_MIN_SECONDS) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'This media is too short for a study guide.',
    });
  }
}

async function hasCurrentGuide(mediaId: string): Promise<boolean> {
  const guide = await db.query.StudyGuide.findFirst({
    columns: { version: true },
    where: (t, { eq }) => eq(t.uploadRecordId, mediaId),
  });
  return guide !== undefined && guide.version >= STUDY_GUIDE_VERSION;
}

async function currentStatus(mediaId: string): Promise<StudyGuideStatus> {
  if (await hasCurrentGuide(mediaId)) {
    return { status: 'ready', url: studyGuideUrl(mediaId) };
  }
  const state = await getStudyGuideWorkflowState(mediaId);
  if (state === 'running') return { status: 'pending' };
  if (state === 'failed') return { status: 'failed' };
  // The workflow may have finished between the two reads; look again before
  // reporting that there's no guide.
  return (await hasCurrentGuide(mediaId))
    ? { status: 'ready', url: studyGuideUrl(mediaId) }
    : { status: 'none' };
}

function rateLimited(retryAfterSeconds: number, resHeaders: Headers): never {
  resHeaders.set('Cache-Control', 'no-store');
  resHeaders.set('Retry-After', String(retryAfterSeconds));
  throw new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many study guides requested. Please try again later.',
  });
}

async function consumeGenerationBudget(ctx: Context, mediaId: string) {
  const decision = await enforceAiRateLimit({
    headers: ctx.req.headers,
    subject: ctx.rateLimitSubject,
    resourceId: `study-guide:${mediaId}`,
    kind: 'study-guide',
  });
  if (!decision.allowed) {
    moduleLogger.warn(
      { context: { limitedBy: decision.limitedBy } },
      'Study guide generation rate limited',
    );
    rateLimited(decision.retryAfterSeconds, ctx.resHeaders);
  }
  const global = await consumeTokenBucketWithFallback({
    ...GLOBAL_BUCKET,
    cost: 1,
  });
  if (!global.allowed) {
    moduleLogger.warn('Study guide generation hit the site-wide cap');
    rateLimited(global.retryAfterSeconds, ctx.resHeaders);
  }
}

export const studyGuideProcedures = router({
  status: publicProcedure
    .input(inputSchema)
    .query(async ({ input, ctx }): Promise<StudyGuideStatus> => {
      await assertGuideable(input.mediaId, ctx);
      return currentStatus(input.mediaId);
    }),

  /** Return the guide if it's ready, otherwise start (or join) generating it. */
  request: publicProcedure
    .input(inputSchema)
    .mutation(async ({ input, ctx }): Promise<StudyGuideStatus> => {
      await assertGuideable(input.mediaId, ctx);
      const status = await currentStatus(input.mediaId);
      if (status.status === 'ready' || status.status === 'pending') {
        return status;
      }
      await consumeGenerationBudget(ctx, input.mediaId);
      await startGenerateStudyGuide(input.mediaId);
      moduleLogger.info(
        { uploadId: input.mediaId },
        'Started study guide generation',
      );
      return { status: 'pending' };
    }),
});
