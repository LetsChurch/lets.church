import {
  Annotation,
  db,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

/**
 * Given a set of upload ids, return the subset that is **missing** the
 * LLM-derived data (a summary AND at least one annotation) and therefore
 * still needs the LLM stages run. Uploads that already have both are
 * omitted so reprocess flows running in "skip if data exists" mode can
 * spend LLM budget only on the gaps.
 *
 * "Has a summary" = `UploadRecord.summarizedAt` is set. "Has annotations"
 * = at least one `annotation` row joined through the upload's transcript
 * paragraphs (annotations key off `paragraph_id`, not the upload).
 */
export async function getUploadsMissingLlmData(
  uploadRecordIds: string[],
): Promise<string[]> {
  if (uploadRecordIds.length === 0) return [];

  const [summarized, annotated] = await Promise.all([
    db
      .select({ id: UploadRecord.id })
      .from(UploadRecord)
      .where(
        and(
          inArray(UploadRecord.id, uploadRecordIds),
          isNotNull(UploadRecord.summarizedAt),
        ),
      ),
    db
      .selectDistinct({ id: TranscriptParagraph.uploadRecordId })
      .from(Annotation)
      .innerJoin(
        TranscriptParagraph,
        eq(Annotation.paragraphId, TranscriptParagraph.id),
      )
      .where(inArray(TranscriptParagraph.uploadRecordId, uploadRecordIds)),
  ]);

  const summarizedSet = new Set(summarized.map((r) => r.id));
  const annotatedSet = new Set(annotated.map((r) => r.id));

  return uploadRecordIds.filter(
    (id) => !(summarizedSet.has(id) && annotatedSet.has(id)),
  );
}
