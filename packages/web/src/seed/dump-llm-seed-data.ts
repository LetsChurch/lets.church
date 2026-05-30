// Dump the current dev DB's LLM-derived state (summaries + summary
// embeddings + transcript paragraphs with embeddings) into per-upload JSON
// files committed under `seed-data/llm/`. The dev seed then reads those
// files and direct-inserts, skipping the OpenRouter calls that produced
// them.
//
// `seed-data/llm/` is git-LFS-tracked (see .gitattributes) but is NOT
// rsynced into S3 — these snapshots are consumed off disk by `dev.ts`,
// not by anything that reads them through the S3 API. Inside the web
// container they're accessible via the `./seed-data:/seed-data` bind mount.
//
// Workflow: regenerate transcripts (`just regenerate-seed-transcript ...`),
// run `just seed` once against a fresh dev stack through the live pipeline
// to populate the DB, then run this dumper (`just dump-llm-seed-data`) to
// snapshot the result back into the repo.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  Annotation,
  db,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { asc, eq, inArray } from 'drizzle-orm';
import {
  LLM_SEED_DATA_DIR,
  LLM_SEEDED_UPLOAD_IDS,
  type LlmSeedSnapshot,
} from './llm-seed';

await mkdir(LLM_SEED_DATA_DIR, { recursive: true });

let written = 0;
let skipped = 0;
for (const uploadId of LLM_SEEDED_UPLOAD_IDS) {
  const [upload] = await db
    .select({
      summary: UploadRecord.summary,
      searchSummary: UploadRecord.searchSummary,
      summaryEmbedding: UploadRecord.summaryEmbedding,
      searchSummaryEmbedding: UploadRecord.searchSummaryEmbedding,
      summarizedAt: UploadRecord.summarizedAt,
    })
    .from(UploadRecord)
    .where(eq(UploadRecord.id, uploadId));

  if (
    !upload?.summary ||
    !upload.searchSummary ||
    !upload.summaryEmbedding ||
    !upload.searchSummaryEmbedding ||
    !upload.summarizedAt
  ) {
    console.warn(
      `[dump] ${uploadId}: missing summary/embeddings in DB; skipping`,
    );
    skipped += 1;
    continue;
  }

  const paragraphRows = await db
    .select({
      id: TranscriptParagraph.id,
      order: TranscriptParagraph.order,
      start: TranscriptParagraph.start,
      end: TranscriptParagraph.end,
      speaker: TranscriptParagraph.speaker,
      speakerEmbedding: TranscriptParagraph.speakerEmbedding,
      text: TranscriptParagraph.text,
      words: TranscriptParagraph.words,
      embedding: TranscriptParagraph.embedding,
    })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadId))
    .orderBy(asc(TranscriptParagraph.order));

  // Group annotations by paragraphId so we can embed them under each
  // snapshot paragraph entry.
  const annotationRows = await db
    .select({
      paragraphId: Annotation.paragraphId,
      kind: Annotation.kind,
      startWord: Annotation.startWord,
      endWord: Annotation.endWord,
      rawSpan: Annotation.rawSpan,
      metadata: Annotation.metadata,
    })
    .from(Annotation)
    .where(
      inArray(
        Annotation.paragraphId,
        paragraphRows.map((p) => p.id),
      ),
    );
  const annotationsByParagraphId = new Map<
    string,
    LlmSeedSnapshot['paragraphs'][number]['annotations']
  >();
  for (const a of annotationRows) {
    const list = annotationsByParagraphId.get(a.paragraphId) ?? [];
    list.push({
      kind: a.kind,
      startWord: a.startWord,
      endWord: a.endWord,
      rawSpan: a.rawSpan,
      metadata: a.metadata,
    });
    annotationsByParagraphId.set(a.paragraphId, list);
  }

  const snapshot: LlmSeedSnapshot = {
    uploadRecordId: uploadId,
    summary: upload.summary,
    searchSummary: upload.searchSummary,
    summaryEmbedding: upload.summaryEmbedding,
    searchSummaryEmbedding: upload.searchSummaryEmbedding,
    summarizedAt: upload.summarizedAt.toISOString(),
    paragraphs: paragraphRows.map(({ id, ...rest }) => ({
      ...rest,
      annotations: annotationsByParagraphId.get(id) ?? [],
    })),
  };

  const outPath = path.join(LLM_SEED_DATA_DIR, `${uploadId}.json`);
  await writeFile(outPath, JSON.stringify(snapshot));
  console.log(
    `[dump] wrote ${path.basename(outPath)} ` +
      `(${paragraphRows.length} paragraphs, ${annotationRows.length} annotations)`,
  );
  written += 1;
}

console.log(`[dump] done: ${written} written, ${skipped} skipped`);
process.exit(0);
