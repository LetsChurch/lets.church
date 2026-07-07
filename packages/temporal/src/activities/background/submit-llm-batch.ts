import { Channel, db, TranscriptParagraph, UploadRecord } from '@letschurch/db';
import { asc, eq, inArray } from 'drizzle-orm';

import {
  ANNOTATE_MODEL,
  EMBED_MAX_INPUTS,
  EMBED_MODEL,
  SUMMARY_MODEL,
} from '../../util/llm';
import logger from '../../util/logger';
import {
  type BatchRequestLine,
  buildChatRequest,
  buildEmbedRequest,
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

export type LlmBatchKind = 'annotate' | 'summarize' | 'embed_paragraphs';

export type SubmitLlmBatchArgs = {
  uploadRecordIds: string[];
  kind: LlmBatchKind;
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
// custom_id (`embed-paragraphs:<uploadId>:<chunkIdx>`) so the
// processor can slice paragraphs back into the right window.
const MAX_INPUTS_PER_EMBED_REQUEST = EMBED_MAX_INPUTS;

// Build all the chat / embed request lines for a group of uploads,
// upload to OpenAI as one JSONL, create the batch, return the
// OpenAI batch id. Called once per batch kind in
// `reprocessGroupWorkflow`. Logs the request count for ops visibility.
//
// Custom-id grammar (the processor side parses these):
//   summarize:<uploadId>
//   annotate:<uploadId>
//   embed-paragraphs:<uploadId>          (response: N vectors, in input order)
//   embed-summary:<uploadId>             (response: 2 vectors: summary, searchSummary)
export default async function submitLlmBatch(
  args: SubmitLlmBatchArgs,
): Promise<SubmitLlmBatchResult> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'submitLlmBatch',
    context: { args },
  });

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

    for (const uploadId of args.uploadRecordIds) {
      const upload = uploadById.get(uploadId);
      const uploadParagraphs = paragraphsByUpload.get(uploadId);
      if (!upload || !uploadParagraphs || uploadParagraphs.length === 0) {
        activityLogger.warn(
          `submitLlmBatch: skipping ${uploadId} — missing record or paragraphs`,
        );
        continue;
      }
      requests.push(
        buildChatRequest(
          `annotate:${uploadId}`,
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
      })
      .from(UploadRecord)
      .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
      .where(inArray(UploadRecord.id, args.uploadRecordIds));
    const uploadById = new Map(uploads.map((u) => [u.id, u]));

    const paragraphs = await db
      .select({
        text: TranscriptParagraph.text,
        uploadRecordId: TranscriptParagraph.uploadRecordId,
      })
      .from(TranscriptParagraph)
      .where(inArray(TranscriptParagraph.uploadRecordId, args.uploadRecordIds))
      .orderBy(asc(TranscriptParagraph.order));
    const paragraphsByUpload = new Map<string, string[]>();
    for (const p of paragraphs) {
      const list = paragraphsByUpload.get(p.uploadRecordId) ?? [];
      list.push(p.text);
      paragraphsByUpload.set(p.uploadRecordId, list);
    }

    for (const uploadId of args.uploadRecordIds) {
      const upload = uploadById.get(uploadId);
      const paragraphTexts = paragraphsByUpload.get(uploadId);
      if (!upload || !paragraphTexts || paragraphTexts.length === 0) {
        activityLogger.warn(
          `submitLlmBatch: skipping ${uploadId} — missing record or paragraphs`,
        );
        continue;
      }
      // One-by-one outline load: cheap because annotate just wrote
      // these to the DB; keeps the prompt-build code simple.
      const sectionInputs = await loadOutlineSectionsForSummary(uploadId);
      requests.push(
        buildChatRequest(
          `summarize:${uploadId}`,
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
    const paragraphs = await db
      .select({
        text: TranscriptParagraph.text,
        uploadRecordId: TranscriptParagraph.uploadRecordId,
      })
      .from(TranscriptParagraph)
      .where(inArray(TranscriptParagraph.uploadRecordId, args.uploadRecordIds))
      .orderBy(asc(TranscriptParagraph.order));
    const byUpload = new Map<string, string[]>();
    for (const p of paragraphs) {
      const list = byUpload.get(p.uploadRecordId) ?? [];
      list.push(p.text);
      byUpload.set(p.uploadRecordId, list);
    }

    // Greedy-pack uploads into batches under the 45K-input safety
    // cap (50K hard limit minus 5K margin). Each upload's paragraphs
    // are further chunked into requests of ≤2048 inputs (OpenAI's
    // per-request cap; observed paragraph density is ~14-19/min, so
    // ~2 hours of content already hits this). custom_id encodes the
    // chunk index so the processor can slice paragraphs back into
    // the right window:
    //   embed-paragraphs:<uploadId>:<chunkIdx>
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

    for (const uploadId of args.uploadRecordIds) {
      const texts = byUpload.get(uploadId);
      if (!texts || texts.length === 0) {
        activityLogger.warn(
          `submitLlmBatch: skipping ${uploadId} — no paragraphs to embed`,
        );
        continue;
      }
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
          buildEmbedRequest(`embed-paragraphs:${uploadId}:${chunkIdx}`, {
            model: EMBED_MODEL,
            input: chunkTexts,
          }),
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
    const batches = await Promise.all(
      pending.map(async (p) => {
        const { batchId, inputFileId } = await submitBatch(
          p.requests,
          '/v1/embeddings',
        );
        return { batchId, inputFileId, requestCount: p.requests.length };
      }),
    );
    activityLogger.info(
      `Submitted ${batches.length} embed_paragraphs batch(es) covering ${included.length} uploads (${batches.map((b) => b.requestCount).join('+')} requests)`,
    );
    return { batches, includedUploadIds: included };
  }

  // Unreachable per LlmBatchKind. embed-summary is intentionally a
  // live activity (see `embedUploadSummariesBulk`) — its work is too
  // small to justify a third 24h batch cycle.
  throw new Error(`Unknown LlmBatchKind: ${args.kind satisfies never}`);
}
