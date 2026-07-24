import {
  Annotation,
  Channel,
  db,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  ANNOTATE_MODEL,
  EMBED_MAX_INPUTS,
  EMBED_MODEL,
  SUMMARY_MODEL,
} from '../../util/llm';
import {
  buildBatchCustomId,
  fingerprintAnnotationSource,
  fingerprintParagraphEmbeddingSource,
  fingerprintSummaryEmbeddingSource,
  fingerprintSummarySource,
} from '../../util/llm-batch-source';
import logger from '../../util/logger';
import {
  type BatchRequestLine,
  buildChatRequest,
  buildEmbedRequest,
  cancelBatch,
  deleteBatchFile,
  submitBatch,
} from '../../util/openai-batch';
import {
  buildAnnotationChatBody,
  type EvalParagraph,
} from './annotate-transcript';
import {
  buildSummaryChatBody,
  DEFAULT_SUMMARY_MAX_TOKENS,
  loadOutlineSectionsForSummary,
} from './summarize-upload';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/submit-llm-batch',
});

export type LlmBatchKind =
  | 'annotate'
  | 'summarize'
  | 'embed_paragraphs'
  | 'embed_summary';

export type SubmitLlmBatchArgs = {
  uploadRecordIds: string[];
  kind: LlmBatchKind;
  // Bypass the persisted-result checks for explicit admin regenerations.
  // Normal processing leaves this false so workflow retries do not submit
  // work whose previous Batch API attempt already landed in the database.
  force?: boolean;
};

export type LlmBatchSubmission = {
  batchId: string;
  inputFileId: string;
  requestCount: number;
};

export type SubmitLlmBatchResult = {
  // One OpenAI batch per entry. Most kinds always produce 0 or 1
  // batch; `embed_paragraphs` may split across multiple batches when
  // total inputs (sum of paragraph counts across all uploads) would
  // exceed OpenAI's 50,000-inputs-per-batch limit. Empty array means
  // no requests qualified — the workflow then skips poll/process for
  // this kind.
  batches: LlmBatchSubmission[];
  // Upload ids that contributed at least one request to ANY of the
  // batches above. (Uploads filtered out for missing data are
  // dropped here too so the caller can skip downstream phases.)
  includedUploadIds: string[];
};

const EMPTY_RESULT: SubmitLlmBatchResult = {
  batches: [],
  includedUploadIds: [],
};

// OpenAI's embed-batch limit on total inputs across all requests in
// the batch (per their docs). We pack uploads greedy under a soft
// cap that leaves a 5K-input safety margin in case a paragraph count
// query goes stale between counting and submitting.
const MAX_EMBED_INPUTS_PER_BATCH = 45_000;

// Per-request input cap. Embed requests with more than this many
// inputs are rejected at OpenAI validation. Observed paragraph
// density on this platform is ~14-19/min, so ~2 hours of content
// already hits this — long-form podcasts and conference recordings
// regularly cross it. Each upload's paragraphs are split into
// EMBED_MAX_INPUTS-sized chunks; the chunkIdx is encoded in the
// custom_id (`ep:<uploadId>:<sourceFingerprint>:<chunkIdx>`) so the
// processor can slice paragraphs back into the right window.
const MAX_INPUTS_PER_EMBED_REQUEST = EMBED_MAX_INPUTS;

// Build all the chat / embed request lines for one or more uploads, upload to
// OpenAI as JSONL, and return the OpenAI batch ids. Regular processing calls
// this with one upload; the array shape is retained so large inputs can still
// shard safely at the embeddings limits.
//
// Custom-id grammar (the processor side parses these):
//   s:<uploadId>:<sourceFingerprint>
//   a:<uploadId>:<sourceFingerprint>
//   ep:<uploadId>:<sourceFingerprint>:<chunkIdx>
//   es:<uploadId>:<sourceFingerprint>
export default async function submitLlmBatch(
  args: SubmitLlmBatchArgs,
): Promise<SubmitLlmBatchResult> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'submitLlmBatch',
    context: { args },
  });

  if (args.uploadRecordIds.length === 0) return EMPTY_RESULT;

  const included: string[] = [];

  if (args.kind === 'annotate') {
    const requests: BatchRequestLine[] = [];
    const uploads = await db
      .select({
        id: UploadRecord.id,
        title: UploadRecord.title,
        description: UploadRecord.description,
        channelName: Channel.name,
      })
      .from(UploadRecord)
      .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
      .where(inArray(UploadRecord.id, args.uploadRecordIds));
    const uploadById = new Map(uploads.map((u) => [u.id, u]));

    const paragraphs = await db
      .select({
        id: TranscriptParagraph.id,
        order: TranscriptParagraph.order,
        text: TranscriptParagraph.text,
        words: TranscriptParagraph.words,
        uploadRecordId: TranscriptParagraph.uploadRecordId,
      })
      .from(TranscriptParagraph)
      .where(inArray(TranscriptParagraph.uploadRecordId, args.uploadRecordIds))
      .orderBy(asc(TranscriptParagraph.order));
    const paragraphsByUpload = new Map<string, EvalParagraph[]>();
    for (const p of paragraphs) {
      const list = paragraphsByUpload.get(p.uploadRecordId) ?? [];
      list.push({ id: p.id, order: p.order, text: p.text, words: p.words });
      paragraphsByUpload.set(p.uploadRecordId, list);
    }

    const existingParagraphIds = new Set<string>();
    if (!args.force && paragraphs.length > 0) {
      const existing = await db
        .select({ paragraphId: Annotation.paragraphId })
        .from(Annotation)
        .where(
          inArray(
            Annotation.paragraphId,
            paragraphs.map((paragraph) => paragraph.id),
          ),
        );
      for (const row of existing) existingParagraphIds.add(row.paragraphId);
    }

    for (const uploadId of args.uploadRecordIds) {
      const upload = uploadById.get(uploadId);
      const uploadParagraphs = paragraphsByUpload.get(uploadId);
      if (!upload || !uploadParagraphs || uploadParagraphs.length === 0) {
        activityLogger.warn(
          `submitLlmBatch: skipping ${uploadId} — missing record or paragraphs`,
        );
        continue;
      }
      if (
        !args.force &&
        uploadParagraphs.some((paragraph) =>
          existingParagraphIds.has(paragraph.id),
        )
      ) {
        activityLogger.info(
          `submitLlmBatch: skipping ${uploadId} — annotations already present`,
        );
        continue;
      }
      const sourceFingerprint = fingerprintAnnotationSource(
        upload,
        uploadParagraphs,
      );
      requests.push(
        buildChatRequest(
          buildBatchCustomId('annotate', uploadId, sourceFingerprint),
          buildAnnotationChatBody(uploadParagraphs, upload, ANNOTATE_MODEL),
        ),
      );
      included.push(uploadId);
    }

    if (requests.length === 0) {
      activityLogger.info(
        'No qualifying annotate work — returning empty result',
      );
      return EMPTY_RESULT;
    }
    // 1 chat req per upload × 100 uploads = 100 requests ≪ 50K —
    // single batch always suffices.
    const { batchId, inputFileId } = await submitBatch(
      requests,
      '/v1/chat/completions',
    );
    activityLogger.info(
      `Submitted annotate batch ${batchId} (${requests.length} requests, ${included.length} uploads)`,
    );
    return {
      batches: [{ batchId, inputFileId, requestCount: requests.length }],
      includedUploadIds: included,
    };
  }

  if (args.kind === 'summarize') {
    // Summarize depends on annotate having already run + persisted
    // OUTLINE annotations. Per upload we load (a) metadata for the
    // prompt header, (b) paragraph texts to fill the transcript
    // body, and (c) outline sections so the prompt can ask the model
    // for per-section descriptions tied back to the already-chosen
    // section breaks.
    const requests: BatchRequestLine[] = [];
    const uploads = await db
      .select({
        id: UploadRecord.id,
        title: UploadRecord.title,
        description: UploadRecord.description,
        channelName: Channel.name,
        summary: UploadRecord.summary,
        searchSummary: UploadRecord.searchSummary,
        sections: UploadRecord.sections,
      })
      .from(UploadRecord)
      .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
      .where(inArray(UploadRecord.id, args.uploadRecordIds));
    const uploadById = new Map(uploads.map((u) => [u.id, u]));

    const paragraphs = await db
      .select({
        id: TranscriptParagraph.id,
        order: TranscriptParagraph.order,
        text: TranscriptParagraph.text,
        uploadRecordId: TranscriptParagraph.uploadRecordId,
      })
      .from(TranscriptParagraph)
      .where(inArray(TranscriptParagraph.uploadRecordId, args.uploadRecordIds))
      .orderBy(asc(TranscriptParagraph.order));
    const paragraphsByUpload = new Map<
      string,
      Array<{ id: string; order: number; text: string }>
    >();
    for (const p of paragraphs) {
      const list = paragraphsByUpload.get(p.uploadRecordId) ?? [];
      list.push({ id: p.id, order: p.order, text: p.text });
      paragraphsByUpload.set(p.uploadRecordId, list);
    }

    for (const uploadId of args.uploadRecordIds) {
      const upload = uploadById.get(uploadId);
      const uploadParagraphs = paragraphsByUpload.get(uploadId);
      if (!upload || !uploadParagraphs || uploadParagraphs.length === 0) {
        activityLogger.warn(
          `submitLlmBatch: skipping ${uploadId} — missing record or paragraphs`,
        );
        continue;
      }
      const paragraphTexts = uploadParagraphs.map(
        (paragraph) => paragraph.text,
      );
      // One-by-one outline load: cheap because annotate just wrote
      // these to the DB; keeps the prompt-build code simple.
      const sectionInputs = await loadOutlineSectionsForSummary(uploadId);
      if (!args.force && upload.summary && upload.searchSummary) {
        const storedIds = new Set(upload.sections.map((section) => section.id));
        const currentIds = new Set(sectionInputs.map((section) => section.id));
        const idsMatch =
          storedIds.size === currentIds.size &&
          [...currentIds].every((id) => storedIds.has(id));
        if (idsMatch) {
          activityLogger.info(
            `submitLlmBatch: skipping ${uploadId} — summary already present`,
          );
          continue;
        }
      }
      const sourceFingerprint = fingerprintSummarySource(
        upload,
        uploadParagraphs,
        sectionInputs,
      );
      requests.push(
        buildChatRequest(
          buildBatchCustomId('summarize', uploadId, sourceFingerprint),
          buildSummaryChatBody(
            paragraphTexts,
            upload,
            SUMMARY_MODEL,
            DEFAULT_SUMMARY_MAX_TOKENS,
            sectionInputs,
          ),
        ),
      );
      included.push(uploadId);
    }

    if (requests.length === 0) {
      activityLogger.info(
        'No qualifying summarize work — returning empty result',
      );
      return EMPTY_RESULT;
    }
    const { batchId, inputFileId } = await submitBatch(
      requests,
      '/v1/chat/completions',
    );
    activityLogger.info(
      `Submitted summarize batch ${batchId} (${requests.length} requests, ${included.length} uploads)`,
    );
    return {
      batches: [{ batchId, inputFileId, requestCount: requests.length }],
      includedUploadIds: included,
    };
  }

  if (args.kind === 'embed_paragraphs') {
    let pendingUploadIds = args.uploadRecordIds;
    if (!args.force) {
      const missing = await db
        .selectDistinct({ uploadRecordId: TranscriptParagraph.uploadRecordId })
        .from(TranscriptParagraph)
        .where(
          and(
            inArray(TranscriptParagraph.uploadRecordId, args.uploadRecordIds),
            isNull(TranscriptParagraph.embedding),
          ),
        );
      pendingUploadIds = missing.map((row) => row.uploadRecordId);
      if (pendingUploadIds.length === 0) {
        activityLogger.info(
          'No qualifying embed_paragraphs work — all paragraphs already embedded',
        );
        return EMPTY_RESULT;
      }
    }

    const paragraphs = await db
      .select({
        id: TranscriptParagraph.id,
        order: TranscriptParagraph.order,
        text: TranscriptParagraph.text,
        uploadRecordId: TranscriptParagraph.uploadRecordId,
      })
      .from(TranscriptParagraph)
      .where(inArray(TranscriptParagraph.uploadRecordId, pendingUploadIds))
      .orderBy(asc(TranscriptParagraph.order));
    const byUpload = new Map<
      string,
      Array<{ id: string; order: number; text: string }>
    >();
    for (const p of paragraphs) {
      const list = byUpload.get(p.uploadRecordId) ?? [];
      list.push({ id: p.id, order: p.order, text: p.text });
      byUpload.set(p.uploadRecordId, list);
    }

    // Greedy-pack uploads into batches under the 45K-input safety
    // cap (50K hard limit minus 5K margin). Each upload's paragraphs
    // are further chunked into requests of ≤2048 inputs (OpenAI's
    // per-request cap; observed paragraph density is ~14-19/min, so
    // ~2 hours of content already hits this). custom_id encodes the
    // chunk index so the processor can slice paragraphs back into
    // the right window:
    //   ep:<uploadId>:<sourceFingerprint>:<chunkIdx>
    // Chunks of the same upload may straddle batches; their order is
    // independent because each chunk carries its own offset.
    const pending: Array<{
      requests: BatchRequestLine[];
      inputCount: number;
    }> = [];
    let current = {
      requests: [] as BatchRequestLine[],
      inputCount: 0,
    };

    for (const uploadId of pendingUploadIds) {
      const uploadParagraphs = byUpload.get(uploadId);
      if (!uploadParagraphs || uploadParagraphs.length === 0) {
        activityLogger.warn(
          `submitLlmBatch: skipping ${uploadId} — no paragraphs to embed`,
        );
        continue;
      }
      const texts = uploadParagraphs.map((paragraph) => paragraph.text);
      const sourceFingerprint =
        fingerprintParagraphEmbeddingSource(uploadParagraphs);
      const chunkCount = Math.ceil(texts.length / MAX_INPUTS_PER_EMBED_REQUEST);
      for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
        const start = chunkIdx * MAX_INPUTS_PER_EMBED_REQUEST;
        const end = Math.min(
          start + MAX_INPUTS_PER_EMBED_REQUEST,
          texts.length,
        );
        const chunkTexts = texts.slice(start, end);
        if (
          current.inputCount + chunkTexts.length > MAX_EMBED_INPUTS_PER_BATCH &&
          current.requests.length > 0
        ) {
          pending.push(current);
          current = { requests: [], inputCount: 0 };
        }
        current.requests.push(
          buildEmbedRequest(
            buildBatchCustomId(
              'embed-paragraphs',
              uploadId,
              sourceFingerprint,
              chunkIdx,
            ),
            {
              model: EMBED_MODEL,
              input: chunkTexts,
            },
          ),
        );
        current.inputCount += chunkTexts.length;
      }
      included.push(uploadId);
    }
    if (current.requests.length > 0) pending.push(current);

    if (pending.length === 0) {
      activityLogger.info(
        'No qualifying embed_paragraphs work — returning empty result',
      );
      return EMPTY_RESULT;
    }
    const settledBatches = await Promise.allSettled(
      pending.map(async (p) => {
        const { batchId, inputFileId } = await submitBatch(
          p.requests,
          '/v1/embeddings',
        );
        return { batchId, inputFileId, requestCount: p.requests.length };
      }),
    );
    const batches = settledBatches.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const failedSubmission = settledBatches.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failedSubmission) {
      // The submit activity will retry as a unit. Cancel every sibling that
      // OpenAI already accepted so the retry cannot leave duplicate billable
      // shards running, and make a best-effort attempt to remove their inputs.
      await Promise.all(
        batches.map(async (batch) => {
          await cancelBatch(batch.batchId);
          await deleteBatchFile(batch.inputFileId);
        }),
      );
      throw failedSubmission.reason;
    }
    activityLogger.info(
      `Submitted ${batches.length} embed_paragraphs batch(es) covering ${included.length} uploads (${batches.map((b) => b.requestCount).join('+')} requests)`,
    );
    return { batches, includedUploadIds: included };
  }

  if (args.kind === 'embed_summary') {
    const rows = await db
      .select({
        id: UploadRecord.id,
        summary: UploadRecord.summary,
        searchSummary: UploadRecord.searchSummary,
        summaryEmbedding: UploadRecord.summaryEmbedding,
        searchSummaryEmbedding: UploadRecord.searchSummaryEmbedding,
      })
      .from(UploadRecord)
      .where(inArray(UploadRecord.id, args.uploadRecordIds));
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const requests: BatchRequestLine[] = [];

    for (const uploadId of args.uploadRecordIds) {
      const row = rowById.get(uploadId);
      if (!row?.summary || !row.searchSummary) {
        activityLogger.warn(
          `submitLlmBatch: skipping ${uploadId} — missing summary/searchSummary`,
        );
        continue;
      }
      if (!args.force && row.summaryEmbedding && row.searchSummaryEmbedding) {
        activityLogger.info(
          `submitLlmBatch: skipping ${uploadId} — summary embeddings already present`,
        );
        continue;
      }
      const sourceFingerprint = fingerprintSummaryEmbeddingSource(
        row.summary,
        row.searchSummary,
      );
      requests.push(
        buildEmbedRequest(
          buildBatchCustomId('embed-summary', uploadId, sourceFingerprint),
          {
            model: EMBED_MODEL,
            input: [row.summary, row.searchSummary],
          },
        ),
      );
      included.push(uploadId);
    }

    if (requests.length === 0) {
      activityLogger.info('No qualifying embed_summary work');
      return EMPTY_RESULT;
    }
    const { batchId, inputFileId } = await submitBatch(
      requests,
      '/v1/embeddings',
    );
    activityLogger.info(
      `Submitted embed_summary batch ${batchId} (${requests.length} requests)`,
    );
    return {
      batches: [{ batchId, inputFileId, requestCount: requests.length }],
      includedUploadIds: included,
    };
  }

  throw new Error(`Unknown LlmBatchKind: ${args.kind satisfies never}`);
}
