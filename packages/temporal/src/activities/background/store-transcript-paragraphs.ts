import { db, TranscriptParagraph, UploadRecord } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import { fingerprintTranscriptSource } from '../../util/llm-batch-source';
import logger from '../../util/logger';
import {
  type TranscriptJsonSegment,
  transcriptJsonSchema,
} from '../../util/whisper';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/store-transcript-paragraphs',
});

/**
 * Read the worker's `{uploadRecordId}/transcript.json`, group its sentence-level
 * segments into paragraphs (via `isParagraphStart`), and persist them to
 * `transcript_paragraph` for word-level rendering on the media page.
 *
 * Idempotent: an identical transcript is a no-op, preserving any LLM work that
 * landed before an activity/workflow retry. A genuinely changed transcript is
 * replaced and all transcript-derived summary state is invalidated in the same
 * transaction. No-ops on legacy transcripts that lack paragraph markers,
 * leaving the media page on the legacy VTT rendering.
 */
export default async function storeTranscriptParagraphs(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'storeTranscriptParagraphs',
    context: { args: { uploadRecordId, s3UploadKey } },
  });

  activityLogger.info('Fetching transcript JSON');
  const res = await publicS3.getObject(s3UploadKey);
  const body = await res.Body?.transformToString('utf-8');
  invariant(body, `No object with key ${s3UploadKey} found`);

  const parsed = transcriptJsonSchema.parse(JSON.parse(body));

  // Legacy gate: only the paragraph-aware worker output carries isParagraphStart.
  if (!parsed.segments.some((s) => s.isParagraphStart)) {
    activityLogger.info(
      'No paragraph markers; skipping (legacy transcript stays on VTT rendering)',
    );
    return { paragraphs: 0 };
  }

  // Group consecutive segments into paragraphs: start a new paragraph when a
  // non-first segment is flagged isParagraphStart (mirrors the worker's
  // group_paragraphs in services/transcribe/src/vtt.py).
  const groups: TranscriptJsonSegment[][] = [];
  for (const [i, seg] of parsed.segments.entries()) {
    if (groups.length === 0 || (i > 0 && seg.isParagraphStart)) {
      groups.push([seg]);
    } else {
      groups[groups.length - 1]?.push(seg);
    }
  }

  const embeddings = parsed.speakerEmbeddings ?? {};
  const rows = groups.map((segs, order) => {
    const words = segs.flatMap((s) =>
      s.words.map((w) => ({ word: w.word, start: w.start, end: w.end })),
    );
    const speaker = segs[0]?.speaker ?? null;
    return {
      uploadRecordId,
      order,
      start: words[0]?.start ?? segs[0]?.start ?? 0,
      end: words.at(-1)?.end ?? segs.at(-1)?.end ?? 0,
      speaker,
      speakerEmbedding: speaker ? (embeddings[speaker] ?? null) : null,
      text: segs
        .map((s) => s.text.trim())
        .join(' ')
        .trim(),
      words,
    };
  });

  const changed = await db.transaction(
    async (tx) => {
      const existing = await tx
        .select({
          order: TranscriptParagraph.order,
          start: TranscriptParagraph.start,
          end: TranscriptParagraph.end,
          speaker: TranscriptParagraph.speaker,
          speakerEmbedding: TranscriptParagraph.speakerEmbedding,
          text: TranscriptParagraph.text,
          words: TranscriptParagraph.words,
        })
        .from(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
        .orderBy(TranscriptParagraph.order);

      if (
        fingerprintTranscriptSource(existing) ===
        fingerprintTranscriptSource(rows)
      ) {
        return false;
      }

      await tx
        .delete(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId));
      if (rows.length > 0) {
        await tx.insert(TranscriptParagraph).values(rows);
      }
      // Paragraph deletion cascades annotations. Clear every summary field as
      // part of the same source-version transition so a no-outline transcript
      // cannot retain a stale summary that the submission stage would skip.
      await tx
        .update(UploadRecord)
        .set({
          summary: null,
          searchSummary: null,
          sections: [],
          summarizedAt: null,
          summaryEmbedding: null,
          searchSummaryEmbedding: null,
        })
        .where(eq(UploadRecord.id, uploadRecordId));
      return true;
    },
    { isolationLevel: 'serializable' },
  );

  activityLogger.info(
    changed
      ? `Stored ${rows.length} changed transcript paragraphs and invalidated derived LLM state`
      : `Transcript source unchanged; preserved ${rows.length} paragraphs and derived LLM state`,
  );
  return { paragraphs: rows.length, changed };
}
