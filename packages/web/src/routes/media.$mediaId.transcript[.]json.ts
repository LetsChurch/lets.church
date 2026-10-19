import { db } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import sanitizeFilename from 'sanitize-filename';

import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import type { Context } from '@/trpc/context';
import { appRouter } from '@/trpc/router';
import { getSession } from '@/util/auth';
import logger from '@/util/logger';
import { canViewMediaById } from '@/util/media-visibility';

const moduleLogger = logger.child({
  module: 'routes/media/$mediaId/transcript.json',
});

// Word timings are stored as raw floats; millisecond precision is all any
// player or editor can use and keeps the file small.
const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

function notFound() {
  return new Response('Transcript not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// `filename` is the ASCII fallback for old clients; `filename*` carries the
// real (possibly non-Latin-1) title, which can't go in a header verbatim.
// encodeURIComponent leaves `'()*!` alone, but RFC 5987 doesn't allow them in
// an ext-value (`'` is its delimiter), so escape those too.
function contentDisposition(title: string) {
  const name =
    sanitizeFilename(`${title} transcript.json`) || 'transcript.json';
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// Word-level transcript download: paragraphs with speaker names and per-word
// timings, built from transcript_paragraph rows (the same data the media page
// renders). Offered alongside the VTT/TXT downloads, so it honors the
// upload's downloadsEnabled setting.
export const Route = createFileRoute('/media/$mediaId/transcript.json')({
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

        const media = await db.query.UploadRecord.findFirst({
          columns: { title: true, lengthSeconds: true, downloadsEnabled: true },
          where: (t, { eq }) => eq(t.id, mediaId),
        });
        if (!media?.downloadsEnabled) {
          return notFound();
        }

        const paragraphs = await appRouter
          .createCaller(ctx)
          .media.getTranscriptParagraphs({ mediaId });
        if (!paragraphs) {
          return notFound();
        }

        const outgoingId = OutgoingIdSchema.parse(mediaId);
        const siteUrl = process.env.PUBLIC_URL || 'https://lets.church';

        moduleLogger.info(
          { uploadId: mediaId, context: { paragraphs: paragraphs.length } },
          'Serving word-level transcript',
        );

        const body = {
          mediaId: outgoingId,
          title: media.title,
          url: `${siteUrl}/media/${outgoingId}`,
          duration: media.lengthSeconds,
          paragraphs: paragraphs.map((p) => ({
            start: ms(p.start),
            end: ms(p.end),
            speaker: p.speakerName,
            text: p.text,
            words: p.words.map((w) => ({
              word: w.word,
              start: ms(w.start),
              end: ms(w.end),
            })),
          })),
        };

        return new Response(JSON.stringify(body, null, 2), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': contentDisposition(
              media.title ?? `media_${outgoingId}`,
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
