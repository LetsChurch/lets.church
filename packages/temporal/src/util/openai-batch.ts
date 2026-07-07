import * as readline from 'node:readline';
import { Readable } from 'node:stream';

import OpenAI, { toFile } from 'openai';
import { z } from 'zod';

import { stripOpenaiPrefix } from './llm';

const env = z
  .object({
    OPENAI_API_KEY: z.string().min(1),
  })
  .parse(process.env);

// Separate SDK instance from `llm.ts` — that one routes through
// OpenRouter for the live path; this one hits OpenAI direct because
// OpenRouter does not proxy the Batch API. Tier 4 limits apply
// (1B chat tokens / 500M embed tokens queued at a time).
export const openaiBatch = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  // No baseURL override — defaults to https://api.openai.com/v1.
  maxRetries: 5,
});

export type BatchEndpoint = '/v1/chat/completions' | '/v1/embeddings';

// One line in a Batch JSONL input file. `body` is whatever the
// targeted endpoint would normally accept as POST JSON (so chat
// completions get `{ model, messages, ... }`, embeddings get
// `{ model, input }`).
export type BatchRequestLine = {
  custom_id: string;
  method: 'POST';
  url: BatchEndpoint;
  body: Record<string, unknown>;
};

// Per-line output entry from a completed batch's output_file. The
// `response.body` shape matches the live endpoint's response shape
// (chat completion or embedding response).
export type BatchResponseLine = {
  id: string;
  custom_id: string;
  response: {
    status_code: number;
    request_id: string;
    body: Record<string, unknown>;
  } | null;
  error: {
    code: string;
    message: string;
  } | null;
};

// Build a chat-completion request line. Caller passes the live
// chat-completion body verbatim; we strip the OpenRouter-only
// fields (`provider`, `usage`) and rewrite the model id. Anything
// else (messages, temperature, max_tokens, response_format) passes
// through.
export function buildChatRequest(
  customId: string,
  body: Record<string, unknown>,
): BatchRequestLine {
  const { provider: _provider, usage: _usage, ...rest } = body;
  return {
    custom_id: customId,
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      ...rest,
      model: stripOpenaiPrefix(String(rest.model ?? '')),
    },
  };
}

export function buildEmbedRequest(
  customId: string,
  body: Record<string, unknown>,
): BatchRequestLine {
  const { provider: _provider, usage: _usage, ...rest } = body;
  return {
    custom_id: customId,
    method: 'POST',
    url: '/v1/embeddings',
    body: {
      ...rest,
      model: stripOpenaiPrefix(String(rest.model ?? '')),
    },
  };
}

// Serialise the request lines as JSONL, upload to the Files API
// (`purpose: 'batch'`), then create the batch job. Returns the
// OpenAI-assigned batch id, which the caller stashes in workflow
// state for polling. `completion_window: '24h'` is the only window
// the API currently accepts.
export async function submitBatch(
  requests: ReadonlyArray<BatchRequestLine>,
  endpoint: BatchEndpoint,
): Promise<{ batchId: string; inputFileId: string }> {
  if (requests.length === 0) {
    throw new Error('submitBatch: empty requests array');
  }
  const jsonl = `${requests.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const file = await openaiBatch.files.create({
    file: await toFile(Buffer.from(jsonl, 'utf8'), 'batch-input.jsonl'),
    purpose: 'batch',
  });
  const batch = await openaiBatch.batches.create({
    input_file_id: file.id,
    endpoint,
    completion_window: '24h',
  });
  return { batchId: batch.id, inputFileId: file.id };
}

export type BatchStatus = {
  status:
    | 'validating'
    | 'in_progress'
    | 'finalizing'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelling'
    | 'cancelled';
  outputFileId: string | null;
  errorFileId: string | null;
  requestCount: number;
  completedCount: number;
  failedCount: number;
};

const TERMINAL_STATUSES = new Set<BatchStatus['status']>([
  'completed',
  'failed',
  'expired',
  'cancelled',
]);

export function isBatchTerminal(status: BatchStatus['status']): boolean {
  return TERMINAL_STATUSES.has(status);
}

// Single poll — returns the current snapshot. The caller (the
// `pollLlmBatch` activity) owns the loop + heartbeats + sleep
// cadence so the polling tempo isn't baked into this util.
export async function pollBatch(batchId: string): Promise<BatchStatus> {
  const batch = await openaiBatch.batches.retrieve(batchId);
  return {
    status: batch.status as BatchStatus['status'],
    outputFileId: batch.output_file_id ?? null,
    errorFileId: batch.error_file_id ?? null,
    requestCount: batch.request_counts?.total ?? 0,
    completedCount: batch.request_counts?.completed ?? 0,
    failedCount: batch.request_counts?.failed ?? 0,
  };
}

// Stream the output file as JSONL, yielding one parsed response line
// at a time. The file content endpoint returns a `Response` whose
// body is a stream; we accumulate into a string and split. Output
// files for a 50K-request batch are bounded by the 200MB API limit
// Stream the file body line-by-line — `response.text()` would buffer
// the entire output as a single JS string, which trips V8's max
// string length (~512 MB) for embed and large annotate batches.
// Annotate echoes the full transcript in every response and embed
// returns 1536-dim vectors per paragraph, so a 100-line shard easily
// exceeds the cap. Using readline on a Node stream view of the body
// keeps live memory bounded to the largest single line.
export async function* downloadOutput(
  fileId: string,
): AsyncGenerator<BatchResponseLine, void, void> {
  const response = await openaiBatch.files.content(fileId);
  if (!response.body) {
    throw new Error(`OpenAI file ${fileId}: empty response body`);
  }
  const nodeStream = Readable.fromWeb(
    response.body as unknown as import('node:stream/web').ReadableStream,
  );
  const rl = readline.createInterface({
    input: nodeStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    yield JSON.parse(line) as BatchResponseLine;
  }
}

// Best-effort cancellation. Used on workflow cleanup so a cancelled
// reprocess doesn't keep charging tokens. Already-terminal batches
// will reject — swallow that.
export async function cancelBatch(batchId: string): Promise<void> {
  try {
    await openaiBatch.batches.cancel(batchId);
  } catch {
    // Already terminal, or batch not found — nothing to do.
  }
}

// Best-effort file delete. Used after `processLlmBatchOutput` to
// clean up the input + output + error files for a completed batch
// — input files count against the organisation file-storage quota
// and don't auto-expire. Already-deleted / not-found files reject;
// swallow those so the cleanup step can't fail the group workflow.
export async function deleteBatchFile(fileId: string): Promise<void> {
  try {
    await openaiBatch.files.delete(fileId);
  } catch {
    // Already deleted, expired, or not found — nothing to do.
  }
}
