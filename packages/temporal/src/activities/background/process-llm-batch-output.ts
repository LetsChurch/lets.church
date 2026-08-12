import {
  Annotation,
  Channel,
  db,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import { Context } from '@temporalio/activity';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { invariant } from 'es-toolkit';

import {
  ANNOTATE_FALLBACK_MODEL,
  ANNOTATE_MODEL,
  EMBED_DIMS,
  EMBED_MAX_INPUTS,
  EMBED_MODEL,
  recordLlmCall,
  SUMMARY_MODEL,
} from '../../util/llm';
import {
  assertBatchSourceCurrent,
  fingerprintAnnotationSource,
  fingerprintParagraphEmbeddingSource,
  fingerprintSummaryEmbeddingSource,
  fingerprintSummarySource,
  parseBatchCustomId,
} from '../../util/llm-batch-source';
import {
  getAnnotationCompletenessGuard,
  getBuiltInCompletionGuard,
  type GuardOutcome,
} from '../../util/llm-completion-guards';
import logger from '../../util/logger';
import {
  type BatchResponseLine,
  downloadOutput,
} from '../../util/openai-batch';
import {
  type EvalParagraph,
  parseAnnotationResponse,
  runAnnotation,
} from './annotate-transcript';
import type { LlmBatchKind } from './submit-llm-batch';
import {
  parseSummaryResponse,
  type SummarySectionInput,
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
  // The workflow treats any such line as a failure so Temporal can retry the
  // regular job through the Batch API again.
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
        failedUploadIds.add(parseBatchCustomId(line.custom_id).uploadId);
        activityLogger.warn(
          `Failed to apply batch line ${line.custom_id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Heartbeat per line so a genuine hang is caught by heartbeatTimeout
      // in minutes rather than burning the whole start-to-close ceiling on
      // a large group.
      Context.current().heartbeat({
        kind: args.kind,
        phase: 'output',
        succeeded,
        failed,
      });
    }
  }

  if (args.errorFileId) {
    for await (const line of downloadOutput(args.errorFileId)) {
      failed += 1;
      const { uploadId } = parseBatchCustomId(line.custom_id);
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
      Context.current().heartbeat({ kind: args.kind, phase: 'error', failed });
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
    sourceFingerprint,
    chunkIdx,
  } = parseBatchCustomId(line.custom_id);
  const expectedCustomKind =
    kind === 'embed_paragraphs'
      ? 'embed-paragraphs'
      : kind === 'embed_summary'
        ? 'embed-summary'
        : kind;
  invariant(
    customKind === expectedCustomKind,
    `Batch kind/custom_id mismatch: kind=${kind}, custom_id=${line.custom_id}`,
  );
  if (customKind === 'summarize') {
    await handleSummary(uploadId, sourceFingerprint, line);
  } else if (customKind === 'annotate') {
    await handleAnnotate(uploadId, sourceFingerprint, line);
  } else if (customKind === 'embed-paragraphs') {
    if (chunkIdx === null) {
      throw new Error(
        `Batch line ${line.custom_id}: embed-paragraphs missing chunk index`,
      );
    }
    await handleEmbedParagraphs(uploadId, sourceFingerprint, chunkIdx, line);
  } else if (customKind === 'embed-summary') {
    await handleEmbedSummary(uploadId, sourceFingerprint, line);
  }
}

function activityForCustomId(customId: string): string {
  const { kind } = parseBatchCustomId(customId);
  if (kind === 'summarize') return 'summarizeUpload';
  if (kind === 'annotate') return 'annotateTranscript';
  if (kind === 'embed-paragraphs') return 'embedTranscriptParagraphs';
  if (kind === 'embed-summary') return 'embedUpload';
  return kind;
}

function modelForKind(kind: LlmBatchKind): string {
  if (kind === 'annotate') return ANNOTATE_MODEL;
  if (kind === 'summarize') return SUMMARY_MODEL;
  return EMBED_MODEL;
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ReadonlyArray<unknown> | null;
    };
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
  sourceFingerprint: string | null,
  line: BatchResponseLine,
): Promise<void> {
  const body = line.response?.body as ChatCompletionResponse;
  const result = await db.transaction(
    async (tx) => {
      const uploads = await tx
        .select({
          title: UploadRecord.title,
          description: UploadRecord.description,
          channelName: Channel.name,
        })
        .from(UploadRecord)
        .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
        .where(eq(UploadRecord.id, uploadId));
      const upload = uploads[0];
      invariant(upload, `Summary batch ${line.custom_id}: upload not found`);

      const paragraphs = await tx
        .select({
          id: TranscriptParagraph.id,
          order: TranscriptParagraph.order,
          text: TranscriptParagraph.text,
        })
        .from(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, uploadId))
        .orderBy(asc(TranscriptParagraph.order));
      invariant(
        paragraphs.length > 0,
        `Summary batch ${line.custom_id}: no paragraphs for upload`,
      );

      const outlineRows = await tx
        .select({
          id: Annotation.id,
          metadata: Annotation.metadata,
          paragraphOrder: TranscriptParagraph.order,
        })
        .from(Annotation)
        .innerJoin(
          TranscriptParagraph,
          eq(TranscriptParagraph.id, Annotation.paragraphId),
        )
        .where(
          and(
            eq(TranscriptParagraph.uploadRecordId, uploadId),
            eq(Annotation.kind, 'OUTLINE'),
            isNotNull(TranscriptParagraph.order),
          ),
        )
        .orderBy(asc(TranscriptParagraph.order));
      const sectionInputs: SummarySectionInput[] = [];
      for (const row of outlineRows) {
        const title =
          typeof row.metadata.title === 'string' ? row.metadata.title : null;
        if (title) {
          sectionInputs.push({
            id: row.id,
            title,
            firstParagraphOrder: row.paragraphOrder,
          });
        }
      }

      assertBatchSourceCurrent(
        line.custom_id,
        sourceFingerprint,
        fingerprintSummarySource(upload, paragraphs, sectionInputs),
      );

      const guard =
        getBuiltInCompletionGuard(body?.choices?.[0]) ??
        ({ outcome: 'success', errorMessage: null } satisfies GuardOutcome);
      const raw = body?.choices?.[0]?.message?.content ?? null;
      if (guard.errorMessage) return { guard, raw };
      invariant(raw, `Summary batch ${line.custom_id}: empty content`);

      const expectedIds = new Set(sectionInputs.map((section) => section.id));
      const { summary, searchSummary, sections } = parseSummaryResponse(
        raw,
        expectedIds,
      );
      await tx
        .update(UploadRecord)
        .set({
          summary,
          searchSummary,
          sections,
          summarizedAt: new Date(),
          // Summary text and vectors are one versioned unit. A retry can then
          // discover and submit only the missing embedding work.
          summaryEmbedding: null,
          searchSummaryEmbedding: null,
        })
        .where(eq(UploadRecord.id, uploadId));
      return { guard, raw };
    },
    { isolationLevel: 'serializable' },
  );

  await recordBatchChatResult({
    model: SUMMARY_MODEL,
    activity: 'summarizeUpload',
    uploadId,
    body,
    result,
  });
  if (result.guard.errorMessage) throw new Error(result.guard.errorMessage);
}

export async function handleAnnotate(
  uploadId: string,
  sourceFingerprint: string | null,
  line: BatchResponseLine,
): Promise<void> {
  const body = line.response?.body as ChatCompletionResponse;
  const uploads = await db
    .select({
      title: UploadRecord.title,
      description: UploadRecord.description,
      channelName: Channel.name,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
    .where(eq(UploadRecord.id, uploadId));
  const upload = uploads[0];
  invariant(upload, `Annotate batch ${line.custom_id}: upload not found`);

  // Reload paragraphs so the parser can map heading + link positions back to
  // word indices, then validate the exact source submitted to OpenAI.
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
  assertBatchSourceCurrent(
    line.custom_id,
    sourceFingerprint,
    fingerprintAnnotationSource(upload, paragraphs),
  );

  const builtInGuard = getBuiltInCompletionGuard(body?.choices?.[0]);
  const guard =
    builtInGuard ??
    getAnnotationCompletenessGuard(
      paragraphs.map((paragraph) => paragraph.text),
      body.usage?.completion_tokens,
    );
  const raw = body?.choices?.[0]?.message?.content ?? null;
  const result = { guard, raw };

  const evalParagraphs: EvalParagraph[] = paragraphs.map((paragraph) => ({
    id: paragraph.id,
    order: paragraph.order,
    text: paragraph.text,
    words: paragraph.words,
  }));
  let annotations;
  if (guard.outcome === 'guard_content_filter' && ANNOTATE_FALLBACK_MODEL) {
    // Preserve the rejected OpenAI Batch call before making the fallback so
    // both billable attempts remain visible even if Anthropic also fails.
    await recordBatchChatResult({
      model: ANNOTATE_MODEL,
      activity: 'annotateTranscript',
      uploadId,
      body,
      result,
    });
    moduleLogger.info(
      {
        uploadRecordId: uploadId,
        context: {
          primaryModel: ANNOTATE_MODEL,
          fallbackModel: ANNOTATE_FALLBACK_MODEL,
        },
      },
      'OpenAI Batch annotation was content-filtered; retrying with fallback model',
    );
    const fallback = await runAnnotation(
      evalParagraphs,
      upload,
      ANNOTATE_FALLBACK_MODEL,
      {
        tracking: {
          activity: 'annotateTranscript',
          uploadRecordId: uploadId,
        },
        via: 'openrouter',
        // This request already is the fallback. Do not recursively retry the
        // same model if its provider also returns a content-filter response.
        fallbackModel: null,
      },
    );
    annotations = fallback.annotations;
  } else {
    if (guard.errorMessage) {
      await recordBatchChatResult({
        model: ANNOTATE_MODEL,
        activity: 'annotateTranscript',
        uploadId,
        body,
        result,
      });
      throw new Error(guard.errorMessage);
    }
    invariant(raw, `Annotate batch ${line.custom_id}: empty content`);
    ({ annotations } = parseAnnotationResponse(raw, evalParagraphs));
  }

  await db.transaction(
    async (tx) => {
      // A live fallback can take long enough for the transcript to be replaced.
      // Re-read and fingerprint inside the write transaction so fallback output
      // is never attached to a different transcript version.
      const currentUploads = await tx
        .select({
          title: UploadRecord.title,
          description: UploadRecord.description,
          channelName: Channel.name,
        })
        .from(UploadRecord)
        .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
        .where(eq(UploadRecord.id, uploadId));
      const currentUpload = currentUploads[0];
      invariant(
        currentUpload,
        `Annotate batch ${line.custom_id}: upload not found before write`,
      );
      const currentParagraphs = await tx
        .select({
          id: TranscriptParagraph.id,
          order: TranscriptParagraph.order,
          text: TranscriptParagraph.text,
          words: TranscriptParagraph.words,
        })
        .from(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, uploadId))
        .orderBy(asc(TranscriptParagraph.order));
      assertBatchSourceCurrent(
        line.custom_id,
        sourceFingerprint,
        fingerprintAnnotationSource(currentUpload, currentParagraphs),
      );

      const paragraphIds = currentParagraphs.map((paragraph) => paragraph.id);
      await tx
        .delete(Annotation)
        .where(inArray(Annotation.paragraphId, paragraphIds));
      if (annotations.length > 0) {
        const now = new Date();
        await tx.insert(Annotation).values(
          annotations.map((annotation) => ({
            ...annotation,
            updatedAt: now,
          })),
        );
      }
      // OUTLINE ids are generated on insert. Existing section descriptions
      // therefore refer to deleted ids and must be cleared atomically.
      await tx
        .update(UploadRecord)
        .set({ sections: [] })
        .where(eq(UploadRecord.id, uploadId));
    },
    { isolationLevel: 'serializable' },
  );

  if (!guard.errorMessage) {
    // Match the existing audit semantics for successful Batch output: only
    // record success after parsing and persistence have both completed.
    await recordBatchChatResult({
      model: ANNOTATE_MODEL,
      activity: 'annotateTranscript',
      uploadId,
      body,
      result,
    });
  }
}

async function handleEmbedParagraphs(
  uploadId: string,
  sourceFingerprint: string | null,
  chunkIdx: number,
  line: BatchResponseLine,
): Promise<void> {
  const body = line.response?.body as EmbeddingsResponse;
  const data = body?.data ?? [];
  await db.transaction(
    async (tx) => {
      // Re-query the whole upload in the same order used at submission. The
      // whole-source fingerprint makes every chunk stale if any row changed.
      const rows = await tx
        .select({
          id: TranscriptParagraph.id,
          order: TranscriptParagraph.order,
          text: TranscriptParagraph.text,
        })
        .from(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, uploadId))
        .orderBy(asc(TranscriptParagraph.order));
      assertBatchSourceCurrent(
        line.custom_id,
        sourceFingerprint,
        fingerprintParagraphEmbeddingSource(rows),
      );

      const chunkStart = chunkIdx * EMBED_PARAGRAPHS_CHUNK_SIZE;
      invariant(
        chunkStart >= 0 && chunkStart < rows.length,
        `Embed-paragraphs batch ${line.custom_id}: chunkStart ${chunkStart} out of range for ${rows.length} rows`,
      );
      const expectedChunkLen = Math.min(
        EMBED_PARAGRAPHS_CHUNK_SIZE,
        rows.length - chunkStart,
      );
      invariant(
        data.length === expectedChunkLen,
        `Embed-paragraphs batch ${line.custom_id}: response length ${data.length} != expected ${expectedChunkLen} (chunkStart=${chunkStart}, totalRows=${rows.length})`,
      );
      const chunkRows = rows.slice(chunkStart, chunkStart + expectedChunkLen);
      const updates = chunkRows.map((row, index) => {
        const embedding = data[index];
        invariant(
          embedding && embedding.index === index,
          `Embed-paragraphs batch ${line.custom_id}: index/order mismatch at ${index}`,
        );
        invariant(
          embedding.embedding.length === EMBED_DIMS,
          `Embed-paragraphs batch ${line.custom_id}: bad embedding dim at ${index}`,
        );
        return { id: row.id, embedding: embedding.embedding };
      });
      await tx.execute(sql`
        UPDATE ${TranscriptParagraph} AS t
        SET embedding = v.embedding
        FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
          AS v(id uuid, embedding jsonb)
        WHERE t.id = v.id
      `);
    },
    { isolationLevel: 'serializable' },
  );

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
  sourceFingerprint: string | null,
  line: BatchResponseLine,
): Promise<void> {
  const body = line.response?.body as EmbeddingsResponse;
  const data = body?.data ?? [];
  await db.transaction(
    async (tx) => {
      const rows = await tx
        .select({
          summary: UploadRecord.summary,
          searchSummary: UploadRecord.searchSummary,
        })
        .from(UploadRecord)
        .where(eq(UploadRecord.id, uploadId));
      const row = rows[0];
      invariant(
        row?.summary && row.searchSummary,
        `Embed-summary batch ${line.custom_id}: current summary is missing`,
      );
      assertBatchSourceCurrent(
        line.custom_id,
        sourceFingerprint,
        fingerprintSummaryEmbeddingSource(row.summary, row.searchSummary),
      );

      invariant(
        data.length === 2,
        `Embed-summary batch ${line.custom_id}: expected 2 vectors, got ${data.length}`,
      );
      const summary = data[0];
      const searchSummary = data[1];
      invariant(
        summary?.index === 0 && searchSummary?.index === 1,
        `Embed-summary batch ${line.custom_id}: index/order mismatch`,
      );
      invariant(
        summary.embedding.length === EMBED_DIMS &&
          searchSummary.embedding.length === EMBED_DIMS,
        `Embed-summary batch ${line.custom_id}: bad embedding dim`,
      );
      await tx
        .update(UploadRecord)
        .set({
          summaryEmbedding: summary.embedding,
          searchSummaryEmbedding: searchSummary.embedding,
        })
        .where(eq(UploadRecord.id, uploadId));
    },
    { isolationLevel: 'serializable' },
  );
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

async function recordBatchChatResult(args: {
  model: string;
  activity: string;
  uploadId: string;
  body: ChatCompletionResponse;
  result: { guard: GuardOutcome; raw: string | null };
}): Promise<void> {
  await recordLlmCall({
    model: args.model,
    activity: args.activity,
    uploadRecordId: args.uploadId,
    promptTokens: args.body.usage?.prompt_tokens ?? null,
    completionTokens: args.body.usage?.completion_tokens ?? null,
    durationMs: 0,
    finishReason: args.body.choices?.[0]?.finish_reason ?? null,
    outcome: args.result.guard.outcome,
    errorMessage: args.result.guard.errorMessage,
    responseText: args.result.raw,
    viaBatch: true,
  });
}
