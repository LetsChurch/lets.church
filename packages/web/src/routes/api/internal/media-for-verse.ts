import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { annotationCoversVerse } from '@/util/bible-annotations';
import logger from '@/util/logger';

const moduleLogger = logger.child({
  module: 'routes/api/internal/media-for-verse',
});

// Media that teaches a specific Bible verse, for the lets.bible study panel's
// "Media" tab. lets.bible calls this server-to-server (in-cluster). It owns the
// heavy joins — Postgres view counts + imgproxy thumbnails + annotation
// timestamps — that lets.bible can't produce from OpenSearch alone.
//
// Auth: none. The payload is only ever PUBLIC, already-approved media
// (accessControlFilter + hydrateUploads enforce PUBLIC visibility below), so
// there is no secret to protect and the endpoint is intentionally open. The
// only client inputs are a shape-validated OSIS book + integer chapter/verse
// (assembled into the terms token server-side, so no injection) and a bounded
// `limit`. See docs/security.md.

// Env is read INSIDE the handler (not at module scope): this route file is part
// of the shared route tree and its module body runs in the client bundle too, so
// a top-level `process.env` parse would throw there. Mirrors search-answer.ts.
const envSchema = z.object({
  // Public web origin, for building absolute media/search links the caller
  // renders verbatim (e.g. https://lets.church). Same env session cookies +
  // password-reset emails use.
  WEB_URL: z.string(),
});

const bodySchema = z.object({
  // OSIS book id (e.g. "John", "1Cor", "Ps"). Assembled into the verse token
  // server-side; the terms filter treats it as data, so it can't inject.
  // OSIS ids are alphanumeric with no dots (the token delimiter).
  book: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[0-9A-Za-z]+$/),
  chapter: z.number().int().positive(),
  verse: z.number().int().positive(),
  // Bound the client-controlled quantity.
  limit: z.number().int().min(1).max(12).default(6),
});

// Recency half-weight from the shipped HN-style upload score
// (packages/temporal/.../update-upload-scores.ts): epoch + the /45000 divisor.
// We keep the recency term but swap the ratings delta for a log10-compressed
// view count, since the user wants views + recency (the precomputed
// UploadRecord.score is ratings-based, not view-based).
const SCORE_EPOCH_MS = 1680145772760;
const RECENCY_DIVISOR = 45000;

function rankScore(viewCount: number, publishedAt: Date): number {
  const views = Math.log10(Math.max(viewCount, 1));
  const seconds = Math.round((publishedAt.getTime() - SCORE_EPOCH_MS) / 1000);
  return views + seconds / RECENCY_DIVISOR;
}

export const Route = createFileRoute('/api/internal/media-for-verse')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { WEB_URL } = envSchema.parse(process.env);

        let input: z.infer<typeof bodySchema>;
        try {
          input = bodySchema.parse(await request.json());
        } catch {
          return new Response('Invalid request body', { status: 400 });
        }

        const { book, chapter, verse, limit } = input;
        const token = `${book}.${chapter}.${verse}`;
        // web's /search validates `bibleRefs` as an ARRAY and parses search
        // params with TanStack Router's default (JSON) serializer, so the value
        // must be a JSON-encoded array — a bare `?bibleRefs=John.3.16` fails the
        // `z.array(...)` schema. Matches how the search UI links itself.
        const searchUrl = `${WEB_URL}/search?bibleRefs=${encodeURIComponent(
          JSON.stringify([token]),
        )}`;

        // Server-only deps loaded lazily so pg / opensearch never enter the
        // client bundle (this route file is part of the shared route tree).
        const [
          { osSearch, accessControlFilter, MEDIA_INDEX },
          { hydrateUploads },
          { db, Annotation, TranscriptParagraph },
          { and, eq, inArray },
          { IncomingIdSchema },
        ] = await Promise.all([
          import('@letschurch/opensearch'),
          import('@/trpc/search/hydrate'),
          import('@letschurch/db'),
          import('drizzle-orm'),
          import('@/schemas/common'),
        ]);

        try {
          // 1. Membership: which public/approved/processed uploads cite this
          //    verse. Reuses the canonical access gate + the range-expanded
          //    `bibleRefs` tokens. Pool sorted newest-first; we re-rank below.
          const osBody = (await osSearch({
            index: MEDIA_INDEX,
            size: 50,
            _source: false,
            sort: [{ publishedAt: 'desc' }],
            query: {
              bool: {
                filter: [
                  ...accessControlFilter(),
                  { terms: { bibleRefs: [token] } },
                ],
              },
            },
          })) as { hits?: { hits?: Array<{ _id: string }> } };

          const rawIds = (osBody.hits?.hits ?? [])
            .map((h) => h._id)
            .filter((id): id is string => typeof id === 'string');

          if (rawIds.length === 0) {
            return Response.json({ items: [], searchUrl });
          }

          // 2. Enrich from Postgres (base58 id, title, channel, thumbnail, view
          //    count, publishedAt, lengthSeconds). Re-checks visibility too.
          const hydrated = await hydrateUploads(rawIds);

          // 3. Best-effort timestamp: find the paragraph in each upload whose
          //    BIBLE annotation covers this verse; deep-link to its start.
          const tsMap = new Map<string, number>();
          const paragraphRows = await db
            .select({
              uploadRecordId: TranscriptParagraph.uploadRecordId,
              start: TranscriptParagraph.start,
              words: TranscriptParagraph.words,
              startWord: Annotation.startWord,
              metadata: Annotation.metadata,
            })
            .from(TranscriptParagraph)
            .innerJoin(
              Annotation,
              eq(Annotation.paragraphId, TranscriptParagraph.id),
            )
            .where(
              and(
                inArray(TranscriptParagraph.uploadRecordId, rawIds),
                eq(Annotation.kind, 'BIBLE'),
              ),
            );

          for (const row of paragraphRows) {
            if (!annotationCoversVerse(row.metadata, book, chapter, verse)) {
              continue;
            }
            const word =
              row.startWord != null ? row.words[row.startWord] : undefined;
            const seconds = word?.start ?? row.start;
            const existing = tsMap.get(row.uploadRecordId);
            // Earliest occurrence wins.
            if (existing == null || seconds < existing) {
              tsMap.set(row.uploadRecordId, seconds);
            }
          }

          // 4. Rank by views + recency, take `limit`, build absolute links.
          const items = hydrated
            .map((u) => {
              const rawId = IncomingIdSchema.parse(u.id);
              const viewCount = u._count.uploadViews;
              const seconds = tsMap.get(rawId) ?? null;
              const hash = seconds != null ? `#t=${Math.round(seconds)}` : '';
              return {
                id: u.id,
                title: u.title,
                channelName: u.channel.name,
                channelSlug: u.channel.slug,
                thumbnailUrl: u.thumbnailUrl,
                lengthSeconds: u.lengthSeconds,
                publishedAt: u.publishedAt,
                viewCount,
                seconds,
                url: `${WEB_URL}/media/${u.id}${hash}`,
                rank: rankScore(viewCount, u.publishedAt),
              };
            })
            .sort((a, b) => b.rank - a.rank)
            .slice(0, limit)
            .map(({ rank: _rank, ...item }) => item);

          return Response.json({ items, searchUrl });
        } catch (error) {
          moduleLogger.error(
            {
              context: {
                error: error instanceof Error ? error.message : String(error),
                token,
              },
            },
            'media-for-verse failed',
          );
          return new Response('Failed to fetch media', { status: 500 });
        }
      },
    },
  },
});
