import {
  db,
  Speaker,
  SpeakerAttribution,
  SpeakerParagraphLabel,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { client, SPEAKER_VECTOR_INDEX } from '@letschurch/opensearch';
import { and, asc, eq, isNull } from 'drizzle-orm';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/sync-speaker-vectors',
});

// Sync ONLY the flat `lc_speaker_vectors` index for a single upload — the voice
// vectors that power one-click speaker-labeling suggestions. The full
// `indexDocument('media', …)` path also does this, but only for uploads that
// have a summary embedding (others are skipped). This standalone pass keeps the
// vectors in sync for any upload that has speaker attributions, independent of
// the media doc — used by the `speaker` reindex kind and reusable after a
// labeling change. The mean-vector logic mirrors index-document.ts's media case;
// keep them in step if either changes.
export async function syncSpeakerVectors(
  uploadRecordId: string,
): Promise<void> {
  const log = moduleLogger.child({
    temporalActivity: 'syncSpeakerVectors',
    uploadRecordId,
  });

  const upRec = await db
    .select({ channelId: UploadRecord.channelId })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadRecordId))
    .then((r) => r[0]);
  if (!upRec) {
    log.warn('Upload record not found; skipping speaker-vector sync');
    return;
  }

  const paragraphs = await db
    .select({
      id: TranscriptParagraph.id,
      speaker: TranscriptParagraph.speaker,
      speakerEmbedding: TranscriptParagraph.speakerEmbedding,
    })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
    .orderBy(asc(TranscriptParagraph.order));

  // Per-paragraph effective-label overrides (a user moved a paragraph to a
  // different/new label before attributing).
  const labelOverrides = await db
    .select({
      paragraphId: SpeakerParagraphLabel.paragraphId,
      label: SpeakerParagraphLabel.label,
    })
    .from(SpeakerParagraphLabel)
    .innerJoin(
      TranscriptParagraph,
      eq(SpeakerParagraphLabel.paragraphId, TranscriptParagraph.id),
    )
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId));
  const overrideByParagraphId = new Map(
    labelOverrides.map((o) => [o.paragraphId, o.label]),
  );

  // (effective label) → resolved identity; soft-deleted speakers excluded.
  const attributions = await db
    .select({
      speakerLabel: SpeakerAttribution.speakerLabel,
      speakerId: SpeakerAttribution.speakerId,
    })
    .from(SpeakerAttribution)
    .innerJoin(Speaker, eq(SpeakerAttribution.speakerId, Speaker.id))
    .where(
      and(
        eq(SpeakerAttribution.uploadRecordId, uploadRecordId),
        isNull(Speaker.deletedAt),
      ),
    );
  const speakerByLabel = new Map(
    attributions.map((a) => [a.speakerLabel, { speakerId: a.speakerId }]),
  );
  const effectiveLabel = (p: (typeof paragraphs)[number]) =>
    overrideByParagraphId.get(p.id) ?? p.speaker;

  // Mean titanet vector per attributed effective label.
  const vecsByLabel = new Map<
    string,
    { speakerId: string; sum: number[]; n: number }
  >();
  for (const p of paragraphs) {
    const label = effectiveLabel(p);
    const resolved = label ? speakerByLabel.get(label) : undefined;
    const emb = p.speakerEmbedding;
    if (!label || !resolved || !Array.isArray(emb) || emb.length === 0) {
      continue;
    }
    const entry = vecsByLabel.get(label);
    if (entry) {
      for (let i = 0; i < emb.length; i++) entry.sum[i] += emb[i] ?? 0;
      entry.n += 1;
    } else {
      vecsByLabel.set(label, {
        speakerId: resolved.speakerId,
        sum: [...emb],
        n: 1,
      });
    }
  }
  const speakerVectors = Array.from(vecsByLabel.entries()).map(
    ([label, { speakerId, sum, n }]) => ({
      id: `${uploadRecordId}:${label}`,
      document: {
        speakerId,
        channelId: upRec.channelId,
        uploadRecordId,
        embedding: sum.map((v) => v / n),
      },
    }),
  );

  // Wipe this upload's existing vectors, then re-add the current set.
  await client.deleteByQuery({
    index: SPEAKER_VECTOR_INDEX,
    refresh: true,
    body: { query: { term: { uploadRecordId } } },
  });
  if (speakerVectors.length > 0) {
    await client.bulk({
      refresh: true,
      body: speakerVectors.flatMap((sv) => [
        { index: { _index: SPEAKER_VECTOR_INDEX, _id: sv.id } },
        sv.document,
      ]),
    });
  }

  log.info(`Synced ${speakerVectors.length} speaker vector(s)`);
}
