import {
  Annotation,
  db,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { asc, eq, inArray } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import {
  ANNOTATE_MODEL,
  EMBED_DIMS,
  EMBED_MAX_INPUTS,
  EMBED_MODEL,
  recordLlmCall,
  SUMMARY_MODEL,
} from '../../util/llm';
import logger from '../../util/logger';
import {
  type BatchResponseLine,
  downloadOutput,
} from '../../util/openai-batch';
import {
  type EvalParagraph,
  parseAnnotationResponse,
} from './annotate-transcript';
import type { LlmBatchKind } from './submit-llm-batch';
import {
  loadOutlineSectionsForSummary,
  parseSummaryResponse,
} from './summarize-upload';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/process-llm-batch-output',
});

// Window size for embed-paragraphs batch requests. Hoisted constant
// shared with the submit side (`submit-llm-batch.ts` chunks at the
// same value); the chunkIdx in the custom_id encodes which window of
// an upload's paragraphs the response corresponds to.
const EMBED_PARAGRAPHS_CHUNK_SIZE = EMBED_MAX_INPUTS;

export type ProcessLlmBatchOutputArgs = {
  batchId: string;
  outputFileId: string | null;
  errorFileId: string | null;
  kind: LlmBatchKind;
};

export type ProcessLlmBatchOutputResult = {
  succeeded: number;
  failed: number;
  // Upload IDs whose batch line failed — either because the OpenAI batch
  // service rejected the request (errorFileId) or because applying the
  // response threw on our side (parse error, DB error, schema mismatch).
  // The workflow uses this list to retry those uploads via the matching
  // live activity (which has model-fallback logic of its own).
  failedUploadIds: string[];
};

// Stream the output JSONL of a completed OpenAI batch and apply each
// response to the DB — summaries/searchSummaries to `upload_record`,
// annotations via delete-then-insert in `annotation`, vectors to
// `transcript_paragraph` / `upload_record`. Each successful line is
// also recorded in `llm_call` with `viaBatch: true` so the cost
// dashboards split batch vs live spend cleanly.
//
// Failures from the error file are also recorded as `llm_call` rows
// with outcome `batch_request_failed`, so the audit log shows what
// didn't make it through. The downstream workflow can then decide
// whether to re-run only the failures.
export default async function processLlmBatchOutput(
  args: ProcessLlmBatchOutputArgs,
): Promise<ProcessLlmBatchOutputResult> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'processLlmBatchOutput',
    context: { args },
  });

  let succeeded = 0;
  let failed = 0;
  const failedUploadIds = new Set<string>();

  if (args.outputFileId) {
    for await (const line of downloadOutput(args.outputFileId)) {
      try {
        await dispatchResponseLine(line, args.kind);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        failedUploadIds.add(parseCustomId(line.custom_id).uploadId);
        activityLogger.warn(
          `Failed to apply batch line ${line.custom_id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  if (args.errorFileId) {
    for await (const line of downloadOutput(args.errorFileId)) {
      failed += 1;
      const { uploadId } = parseCustomId(line.custom_id);
      failedUploadIds.add(uploadId);
      // Persist the raw line when our reader doesn't recognize the
      // shape — OpenAI's parameter-validation rejections (e.g. the
      // gpt-5.4 `max_tokens` → `max_completion_tokens` switchover)
      // emit error lines that don't carry the {code, message} pair we
      // expect, and the previous `'unknown batch error'` fallback
      // dropped the actual diagnostic on the floor. Truncate to keep
      // the column reasonable; the full file is still on OpenAI's
      // side for the 30-day retention window.
      const errorMessage = line.error
        ? `${line.error.code}: ${line.error.message}`
        : JSON.stringify(line.error ?? line).slice(0, 1024);
      await recordLlmCall({
        model: modelForKind(args.kind),
        activity: activityForCustomId(line.custom_id),
        uploadRecordId: uploadId,
        promptTokens: null,
        completionTokens: null,
        durationMs: 0,
        outcome: 'batch_request_failed',
        errorMessage,
        viaBatch: true,
      });
      activityLogger.warn(
        `Batch ${args.batchId} request ${line.custom_id} failed: ${errorMessage}`,
      );
    }
  }

  activityLogger.info(
    `Processed batch ${args.batchId}: ${succeeded} succeeded, ${failed} failed`,
  );
  return { succeeded, failed, failedUploadIds: [...failedUploadIds] };
}

async function dispatchResponseLine(
  line: BatchResponseLine,
  kind: LlmBatchKind,
): Promise<void> {
  if (line.error) {
    throw new Error(
      `Batch line ${line.custom_id} returned error: ${line.error.message}`,
    );
  }
  if (!line.response || line.response.status_code !== 200) {
    throw new Error(
      `Batch line ${line.custom_id} non-200: ${line.response?.status_code}`,
    );
  }
  const {
    kind: customKind,
    uploadId,
    chunkIdx,
  } = parseCustomId(line.custom_id);
  if (customKind === 'summarize') {
    await handleSummary(uploadId, line);
  } else if (customKind === 'annotate') {
    await handleAnnotate(uploadId, line);
  } else if (customKind === 'embed-paragraphs') {
    if (chunkIdx === null) {
      throw new Error(
        `Batch line ${line.custom_id}: embed-paragraphs missing chunk index`,
      );
    }
    await handleEmbedParagraphs(uploadId, chunkIdx, line);
  } else if (customKind === 'embed-summary') {
    await handleEmbedSummary(uploadId, line);
  } else {
    throw new Error(`Unknown batch custom_id kind: ${customKind}`);
  }
  // Sanity: the kind argument matches the request kind it should
  // contain. Cheap defensive check against caller bugs that submit a
  // chat-batch outputFileId as `kind: embed_paragraphs` etc.
  if (
    (kind === 'annotate' && customKind !== 'annotate') ||
    (kind === 'summarize' && customKind !== 'summarize') ||
    (kind === 'embed_paragraphs' && customKind !== 'embed-paragraphs')
  ) {
    moduleLogger.warn(
      `Batch kind/custom_id mismatch: kind=${kind}, custom_id=${line.custom_id}`,
    );
  }
}

// Custom-id grammar (set in `submit-llm-batch.ts`):
//   annotate:<uuid>
//   summarize:<uuid>
//   embed-paragraphs:<uuid>:<chunkIdx>     (chunkIdx ∈ [0, ⌈n/2048⌉))
// embed-summary is intentionally not batched — it runs as a live
// `embedUploadSummariesBulk` activity in the group workflow.
// UUIDs don't contain `:`, so split on `:` is unambiguous. The
// chunkIdx is only set for embed-paragraphs; null otherwise.
function parseCustomId(customId: string): {
  kind: string;
  uploadId: string;
  chunkIdx: number | null;
} {
  const parts = customId.split(':');
  const chunkRaw = parts[2];
  const chunkIdx =
    chunkRaw !== undefined && /^\d+$/.test(chunkRaw)
      ? Number.parseInt(chunkRaw, 10)
      : null;
  return {
    kind: parts[0] ?? '',
    uploadId: parts[1] ?? '',
    chunkIdx,
  };
}

function activityForCustomId(customId: string): string {
  const { kind } = parseCustomId(customId);
  if (kind === 'summarize') return 'summarizeUpload';
  if (kind === 'annotate') return 'annotateTranscript';
  if (kind === 'embed-paragraphs') return 'embedTranscriptParagraphs';
  return kind;
}

function modelForKind(kind: LlmBatchKind): string {
  if (kind === 'annotate' || kind === 'summarize') return SUMMARY_MODEL;
  return EMBED_MODEL;
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

type EmbeddingsResponse = {
  data?: Array<{ index: number; embedding: number[] }>;
  usage?: {
    prompt_tokens?: number;
  };
};

async function handleSummary(
  uploadId: string,
  line: BatchResponseLine,
): Promise<void> {
  const body = line.response?.body as ChatCompletionResponse;
  const raw = body?.choices?.[0]?.message?.content;
  invariant(raw, `Summary batch ${line.custom_id}: empty content`);
  // Load the same outline section IDs the prompt was built from
  // (annotate persisted these BEFORE this summarize batch ran). We
  // pass them to the parser so an extra/hallucinated section in the
  // model's response gets filtered out before hitting the DB.
  const sectionInputs = await loadOutlineSectionsForSummary(uploadId);
  const expectedIds = new Set(sectionInputs.map((s) => s.id));
  const { summary, searchSummary, sections } = parseSummaryResponse(
    raw,
    expectedIds,
  );
  await db
    .update(UploadRecord)
    .set({ summary, searchSummary, sections, summarizedAt: new Date() })
    .where(eq(UploadRecord.id, uploadId));
  await recordLlmCall({
    model: SUMMARY_MODEL,
    activity: 'summarizeUpload',
    uploadRecordId: uploadId,
    promptTokens: body.usage?.prompt_tokens ?? null,
    completionTokens: body.usage?.completion_tokens ?? null,
    durationMs: 0,
    finishReason: body.choices?.[0]?.finish_reason ?? null,
    outcome: 'success',
    responseText: raw,
    viaBatch: true,
  });
}

async function handleAnnotate(
  uploadId: string,
  line: BatchResponseLine,
): Promise<void> {
  const body = line.response?.body as ChatCompletionResponse;
  const raw = body?.choices?.[0]?.message?.content;
  invariant(raw, `Annotate batch ${line.custom_id}: empty content`);

  // Reload paragraphs so the parser can map heading + link positions
  // back to word indices — same shape `runAnnotation` builds for the
  // live path.
  const paragraphs = await db
    .select({
      id: TranscriptParagraph.id,
      order: TranscriptParagraph.order,
      text: TranscriptParagraph.text,
      words: TranscriptParagraph.words,
    })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadId))
    .orderBy(asc(TranscriptParagraph.order));
  invariant(
    paragraphs.length > 0,
    `Annotate batch ${line.custom_id}: no paragraphs for upload`,
  );

  const evalParagraphs: EvalParagraph[] = paragraphs.map((p) => ({
    id: p.id,
    order: p.order,
    text: p.text,
    words: p.words,
  }));
  const { annotations } = parseAnnotationResponse(raw, evalParagraphs);

  const now = new Date();
  const paragraphIds = paragraphs.map((p) => p.id);
  await db.transaction(async (tx) => {
    await tx
      .delete(Annotation)
      .where(inArray(Annotation.paragraphId, paragraphIds));
    if (annotations.length > 0) {
      await tx
        .insert(Annotation)
        .values(annotations.map((a) => ({ ...a, updatedAt: now })));
    }
  });

  await recordLlmCall({
    model: ANNOTATE_MODEL,
    activity: 'annotateTranscript',
    uploadRecordId: uploadId,
    promptTokens: body.usage?.prompt_tokens ?? null,
    completionTokens: body.usage?.completion_tokens ?? null,
    durationMs: 0,
    finishReason: body.choices?.[0]?.finish_reason ?? null,
    outcome: 'success',
    responseText: raw,
    viaBatch: true,
  });
}

async function handleEmbedParagraphs(
  uploadId: string,
  chunkIdx: number,
  line: BatchResponseLine,
): Promise<void> {
  const body = line.response?.body as EmbeddingsResponse;
  const data = body?.data ?? [];

  // Re-query paragraphs in the SAME order as we submitted (asc by
  // `order`) so embeddings line up by `data[i].index`. The submit
  // path uses the identical ORDER BY, and chunks the upload's
  // paragraphs into 2048-input windows; this chunk corresponds to
  // the slice `[chunkIdx*2048, chunkIdx*2048 + expectedChunkLen)`.
  const rows = await db
    .select({ id: TranscriptParagraph.id })
    .from(TranscriptParagraph)
    .where(eq(TranscriptParagraph.uploadRecordId, uploadId))
    .orderBy(asc(TranscriptParagraph.order));
  const chunkStart = chunkIdx * EMBED_PARAGRAPHS_CHUNK_SIZE;
  invariant(
    chunkStart >= 0 && chunkStart < rows.length,
    `Embed-paragraphs batch ${line.custom_id}: chunkStart ${chunkStart} out of range for ${rows.length} rows`,
  );
  // Derive the expected chunk length from the submit-side window —
  // NOT from `data.length`. If the provider ever returns a partial
  // response, or paragraphs were added/deleted between submit and
  // process (a re-transcribe mid-batch is the realistic case),
  // slicing by `data.length` would silently misalign embeddings
  // with paragraphs. Asserting the expected size catches both.
  const expectedChunkLen = Math.min(
    EMBED_PARAGRAPHS_CHUNK_SIZE,
    rows.length - chunkStart,
  );
  invariant(
    data.length === expectedChunkLen,
    `Embed-paragraphs batch ${line.custom_id}: response length ${data.length} != expected ${expectedChunkLen} (chunkStart=${chunkStart}, totalRows=${rows.length}). Paragraph count may have changed since submit; skip + re-run rather than misalign vectors.`,
  );
  const chunkRows = rows.slice(chunkStart, chunkStart + expectedChunkLen);

  await db.transaction(async (tx) => {
    await Promise.all(
      chunkRows.map((r, i) => {
        // Parity with `embed-transcript-paragraphs.ts`'s live path:
        // OpenAI documents `data` as input-ordered but we still
        // assert `index === i` so a future routing change can't
        // silently misalign vectors with paragraphs.
        const d = data[i];
        invariant(
          d && d.index === i,
          `Embed-paragraphs batch ${line.custom_id}: index/order mismatch at ${i}`,
        );
        invariant(
          d.embedding.length === EMBED_DIMS,
          `Embed-paragraphs batch ${line.custom_id}: bad embedding dim at ${i}`,
        );
        return tx
          .update(TranscriptParagraph)
          .set({ embedding: d.embedding })
          .where(eq(TranscriptParagraph.id, r.id));
      }),
    );
  });

  await recordLlmCall({
    model: EMBED_MODEL,
    activity: 'embedTranscriptParagraphs',
    uploadRecordId: uploadId,
    promptTokens: body.usage?.prompt_tokens ?? null,
    completionTokens: 0,
    durationMs: 0,
    outcome: 'success',
    viaBatch: true,
  });
}

async function handleEmbedSummary(
  uploadId: string,
  line: BatchResponseLine,
): Promise<void> {
  const body = line.response?.body as EmbeddingsResponse;
  const data = body?.data ?? [];
  invariant(
    data.length === 2,
    `Embed-summary batch ${line.custom_id}: expected 2 vectors, got ${data.length}`,
  );
  const d0 = data[0];
  const d1 = data[1];
  invariant(
    d0 && d0.index === 0 && d1 && d1.index === 1,
    `Embed-summary batch ${line.custom_id}: index/order mismatch`,
  );
  const summaryEmb = d0.embedding;
  const searchEmb = d1.embedding;
  invariant(
    summaryEmb.length === EMBED_DIMS && searchEmb.length === EMBED_DIMS,
    `Embed-summary batch ${line.custom_id}: bad embedding dim`,
  );
  await db
    .update(UploadRecord)
    .set({ summaryEmbedding: summaryEmb, searchSummaryEmbedding: searchEmb })
    .where(eq(UploadRecord.id, uploadId));
  await recordLlmCall({
    model: EMBED_MODEL,
    activity: 'embedUpload',
    uploadRecordId: uploadId,
    promptTokens: body.usage?.prompt_tokens ?? null,
    completionTokens: 0,
    durationMs: 0,
    outcome: 'success',
    viaBatch: true,
  });
}
