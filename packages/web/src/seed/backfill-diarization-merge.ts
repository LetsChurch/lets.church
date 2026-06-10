// Backfill the diarization "absorb short segments" fix directly in the DB,
// WITHOUT re-running the audio pipeline (which would delete+reinsert paragraphs
// and cascade away annotations). Over-segmentation produces spurious tiny
// speaker labels (a single narrator split into SPEAKER_00..07); each spurious
// label is made of sub-1.5s paragraphs whose titanet embedding is unreliable.
//
// Two in-place fixes, mirroring services/transcribe/src/diarization.py so the
// seed matches what the tuned pipeline now produces:
//   1. Absorb: a label is "reliable" if its TOTAL speech across the upload is
//      >= MIN_TOTAL_SECS; every paragraph of an UNreliable label is reassigned
//      to the nearest reliable label by time, adopting that label's centroid
//      embedding. (A total-duration rule, not a per-paragraph one: a single
//      distinct ~1.6s segment clears any per-paragraph cutoff yet is still a
//      spurious one-off speaker — only a label that speaks for a few seconds
//      total is a real speaker.)
//   2. Renumber: surviving labels are renumbered to contiguous SPEAKER_NN by
//      first appearance (so merging SPEAKER_01 away doesn't leave SPEAKER_00 +
//      SPEAKER_02), matching the diarizer's own labeling.
//
// This only UPDATEs `transcript_paragraph.speaker`/`speakerEmbedding` — paragraph
// ids (and therefore annotations) are preserved. It does NOT touch the speaker
// library tables (which don't exist on kyrios); on branches that have them, the
// only attributed label is the first one (SPEAKER_00), which renumber never
// renames, so attributions stay valid.

import { db, TranscriptParagraph } from '@letschurch/db';
import indexDocument from '@letschurch/temporal/activities/background/index-document';
import { asc, eq } from 'drizzle-orm';

const MIN_TOTAL_SECS = Number(process.env.DIARIZATION_MIN_TOTAL_SECS ?? '3.0');

const uploadRows = await db
  .selectDistinct({ uploadRecordId: TranscriptParagraph.uploadRecordId })
  .from(TranscriptParagraph);

let changedUploads = 0;
let changedParagraphs = 0;

for (const { uploadRecordId } of uploadRows) {
  const paras = await db
    .select({
      id: TranscriptParagraph.id,
      start: TranscriptParagraph.start,
      end: TranscriptParagraph.end,
      speaker: TranscriptParagraph.speaker,
      speakerEmbedding: TranscriptParagraph.speakerEmbedding,
    })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadRecordId))
    .orderBy(asc(TranscriptParagraph.order));

  // A label is reliable iff its TOTAL speech across the upload >= MIN_TOTAL_SECS.
  const totalByLabel = new Map<string, number>();
  const centroidByLabel = new Map<string, number[] | null>();
  for (const p of paras) {
    if (!p.speaker) continue;
    totalByLabel.set(
      p.speaker,
      (totalByLabel.get(p.speaker) ?? 0) + (p.end - p.start),
    );
    if (!centroidByLabel.has(p.speaker)) {
      centroidByLabel.set(p.speaker, p.speakerEmbedding);
    }
  }
  const reliableLabels = new Set<string>();
  for (const [label, total] of totalByLabel) {
    if (total >= MIN_TOTAL_SECS) reliableLabels.add(label);
  }
  if (reliableLabels.size === 0) continue; // nothing trustworthy to absorb into

  const targets = paras.filter(
    (p) => p.speaker && reliableLabels.has(p.speaker),
  );

  // (1) Absorb: post-merge label per paragraph — reliable keeps its own; short
  // takes the nearest reliable paragraph's label (gap 0 when overlapping).
  const mergedLabel = new Map<string, string>(); // paragraphId -> label
  for (const p of paras) {
    if (!p.speaker) continue;
    if (reliableLabels.has(p.speaker)) {
      mergedLabel.set(p.id, p.speaker);
      continue;
    }
    let best: (typeof targets)[number] | null = null;
    let bestGap = Infinity;
    for (const t of targets) {
      const gap = Math.max(t.start - p.end, p.start - t.end, 0);
      if (gap < bestGap) {
        bestGap = gap;
        best = t;
      }
    }
    if (best?.speaker) mergedLabel.set(p.id, best.speaker);
  }

  // (2) Renumber: contiguous SPEAKER_NN by first appearance of the merged label.
  const renumber = new Map<string, string>();
  for (const p of paras) {
    const ml = mergedLabel.get(p.id);
    if (ml && !renumber.has(ml)) {
      renumber.set(ml, `SPEAKER_${String(renumber.size).padStart(2, '0')}`);
    }
  }

  // Final per-paragraph (merged + renumbered) label; update only what changed.
  // Updates are keyed by paragraph id with precomputed final values, so the
  // chained-rename (SPEAKER_02->01 while SPEAKER_01->00) can't collide.
  const updates: Array<{ id: string; speaker: string; emb: number[] | null }> =
    [];
  for (const p of paras) {
    const ml = mergedLabel.get(p.id);
    if (!ml) continue;
    const finalLabel = renumber.get(ml);
    if (!finalLabel || finalLabel === p.speaker) continue;
    updates.push({
      id: p.id,
      speaker: finalLabel,
      emb: centroidByLabel.get(ml) ?? p.speakerEmbedding,
    });
  }
  if (updates.length === 0) continue;

  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx
        .update(TranscriptParagraph)
        .set({ speaker: u.speaker, speakerEmbedding: u.emb })
        .where(eq(TranscriptParagraph.id, u.id));
    }
  });

  changedUploads += 1;
  changedParagraphs += updates.length;
  const before = new Set(paras.map((p) => p.speaker).filter(Boolean)).size;
  console.log(
    `[diarization-fix] ${uploadRecordId}: ${updates.length} paragraphs updated; ` +
      `labels ${before} -> ${renumber.size}`,
  );

  // Re-index so lc_media_v1 (speaker rollup) + lc_speaker_vectors pick it up.
  await indexDocument('media', uploadRecordId);
}

console.log(
  `[diarization-fix] done: ${changedParagraphs} paragraphs across ${changedUploads} uploads`,
);
process.exit(0);
