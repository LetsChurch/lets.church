import { Channel, db, StudyGuide, UploadRecord } from '@letschurch/db';
import {
  STUDY_GUIDE_VERSION,
  StudyGuideContentSchema,
} from '@letschurch/temporal/util/study-guide';
import { createFileRoute } from '@tanstack/react-router';
import { eq } from 'drizzle-orm';

import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import type { Context } from '@/trpc/context';
import { getSession } from '@/util/auth';
import { attachmentDisposition } from '@/util/content-disposition';
import logger from '@/util/logger';
import { canViewMediaById } from '@/util/media-visibility';
import {
  consumeTokenBucketWithFallback,
  rateLimitIdentifier,
} from '@/util/rate-limit';
import { getClientIpAddress } from '@/util/request-ip';

const moduleLogger = logger.child({
  module: 'routes/media/$mediaId/study-guide.pdf',
});

// Each download renders the PDF (react-pdf layout plus QR codes, CPU on the
// event loop), so one client can't fetch it in a tight loop: a class's worth
// of downloads, then one every 6 seconds.
const RENDER_BUCKET = { capacity: 30, refillTokensPerSecond: 1 / 6 };

async function renderAllowed(headers: Headers): Promise<boolean> {
  const clientIp = getClientIpAddress(headers);
  if (!clientIp) return true;
  const { allowed } = await consumeTokenBucketWithFallback({
    key: `study-guide-pdf:ip:${rateLimitIdentifier(clientIp)}`,
    ...RENDER_BUCKET,
    cost: 1,
  });
  return allowed;
}

function notFound() {
  return new Response('Study guide not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// The printable study guide, rendered on each request from the stored content
// (generated once per upload by generateStudyGuideWorkflow; the media page's
// Study guide action starts that). 404 until the guide exists.
export const Route = createFileRoute('/media/$mediaId/study-guide.pdf')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const parsedId = IncomingIdSchema.safeParse(params.mediaId);
        if (!parsedId.success) {
          return notFound();
        }
        const mediaId = parsedId.data;

        const session = await getSession();
        const ctx: Context = {
          session,
          req: request,
          resHeaders: new Headers(),
          isSiteAdmin: session?.appUser?.role === 'ADMIN',
          rateLimitSubject: null,
        };
        if (!(await canViewMediaById(mediaId, ctx))) {
          return notFound();
        }

        const row = await db
          .select({
            content: StudyGuide.content,
            version: StudyGuide.version,
            title: UploadRecord.title,
            publishedAt: UploadRecord.publishedAt,
            lengthSeconds: UploadRecord.lengthSeconds,
            channelName: Channel.name,
          })
          .from(StudyGuide)
          .innerJoin(
            UploadRecord,
            eq(UploadRecord.id, StudyGuide.uploadRecordId),
          )
          .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
          .where(eq(StudyGuide.uploadRecordId, mediaId))
          .then((r) => r[0]);
        if (!row || row.version < STUDY_GUIDE_VERSION) {
          return notFound();
        }
        const content = StudyGuideContentSchema.safeParse(row.content);
        if (!content.success) {
          moduleLogger.error(
            { uploadId: mediaId, context: { issues: content.error.issues } },
            'Stored study guide failed validation',
          );
          return notFound();
        }

        if (!(await renderAllowed(request.headers))) {
          return new Response('Too many requests', {
            status: 429,
            headers: { 'Content-Type': 'text/plain', 'Retry-After': '6' },
          });
        }

        const outgoingId = OutgoingIdSchema.parse(mediaId);
        // Printed in the footer and the QR codes, so it must be this
        // deployment's own origin.
        const siteUrl = process.env.WEB_URL || 'https://lets.church';
        // Loaded on demand: react-pdf and the inlined fonts are only needed
        // for this route, not in every server chunk.
        const { renderStudyGuidePdf } =
          await import('@/study-guide/render.server');
        const pdf = await renderStudyGuidePdf({
          content: content.data,
          channelName: row.channelName,
          publishedAt: row.publishedAt,
          lengthSeconds: row.lengthSeconds,
          mediaUrl: `${siteUrl}/media/${outgoingId}`,
        });

        moduleLogger.info(
          { uploadId: mediaId, context: { bytes: pdf.length } },
          'Serving study guide',
        );
        return new Response(new Uint8Array(pdf), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': attachmentDisposition(
              `${row.title ?? content.data.title} study guide.pdf`,
              'study-guide.pdf',
            ),
            // Private media is gated per viewer, so never let a shared cache
            // hold it.
            'Cache-Control': 'private, no-store',
          },
        });
      },
    },
  },
});
