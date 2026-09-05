import { db, LlmCall } from '@letschurch/db';
import { ApplicationFailure } from '@temporalio/activity';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { z } from 'zod';

import {
  DETERMINISTIC_LLM_FALLBACK_FAILURE,
  getBuiltInCompletionGuard,
  type GuardOutcome,
  isDeterministicFallbackOutcome,
} from './llm-completion-guards';
import { computeCost } from './llm-pricing';
import logger from './logger';

const moduleLogger = logger.child({ module: 'temporal/util/llm' });
const openaiProductionModel = z
  .string()
  .startsWith(
    'openai/',
    'Production OpenAI models must use the canonical openai/* id',
  );

const env = z
  .object({
    // Primary production chat completions use OpenAI Flex. OpenRouter is used
    // by the admin LLM-eval page and the live content-filter fallbacks.
    OPENAI_API_KEY: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_SUMMARY_MODEL: openaiProductionModel.default(
      'openai/gpt-5.6-luna',
    ),
    // Annotation defaults to gpt-5.6-luna. The full-doc markdown-output
    // approach (paragraph-echo + inline links, see annotate-transcript.ts)
    // is the only output format the activity supports; the earlier
    // strict-JSON-schema path that ran into OpenAI's response-side
    // safety classifier was retired with that rewrite. Sampling parameters
    // stay at the provider default because supported overrides vary by model.
    OPENROUTER_ANNOTATE_MODEL: openaiProductionModel.default(
      'openai/gpt-5.6-luna',
    ),
    // Live OpenRouter fallback for annotations rejected by OpenAI's content
    // classifier. Empty disables the fallback.
    OPENROUTER_ANNOTATE_FALLBACK_MODEL: z
      .string()
      .default('anthropic/claude-haiku-4-5'),
    // The summary fallback remains live through OpenRouter. Separate config
    // lets operators choose a different model for the shorter summary task.
    OPENROUTER_SUMMARY_FALLBACK_MODEL: z
      .string()
      .default('anthropic/claude-haiku-4-5'),
  })
  .parse(process.env);

// Production client — OpenAI direct (default baseURL https://api.openai.com/v1).
// Non-Flex calls keep SDK retries. Flex calls override retries per request so
// Temporal owns the durable retry horizon instead of nesting long SDK retries.
export const openaiClient = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  maxRetries: 5,
});
const FLEX_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;
const FLEX_BACKGROUND_ACTIVITIES: Record<string, true> = {
  annotateTranscript: true,
  summarizeUpload: true,
};

// OpenRouter client — used by the admin LLM-eval page and the live
// content-filter fallbacks.
export const openrouterClient = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  maxRetries: 5,
});

// Model ids are kept canonical (`openai/…`, the OpenRouter form) everywhere we
// store/aggregate them — env defaults, the pricing table, `llm_call.model` — so
// cost lookups stay stable across providers. OpenAI direct expects a bare id,
// so strip the prefix at that boundary.
export function stripOpenaiPrefix(model: string): string {
  return model.startsWith('openai/') ? model.slice('openai/'.length) : model;
}

// Env-configurable: safe to swap because changing the chat model only affects
// new output. Override via `OPENROUTER_SUMMARY_MODEL` when needed.
export const SUMMARY_MODEL = env.OPENROUTER_SUMMARY_MODEL;
export const ANNOTATE_MODEL = env.OPENROUTER_ANNOTATE_MODEL;
export const ANNOTATE_FALLBACK_MODEL =
  env.OPENROUTER_ANNOTATE_FALLBACK_MODEL.length > 0
    ? env.OPENROUTER_ANNOTATE_FALLBACK_MODEL
    : null;
export const SUMMARY_FALLBACK_MODEL =
  env.OPENROUTER_SUMMARY_FALLBACK_MODEL.length > 0
    ? env.OPENROUTER_SUMMARY_FALLBACK_MODEL
    : null;

// Hardcoded — NOT env-configurable. Changing the embedding model invalidates
// every stored vector because cross-model cosine similarity is meaningless.
// Keep the canonical `openai/` prefix for storage; strip it at the API boundary.
export const EMBED_MODEL = 'openai/text-embedding-3-small';
export const EMBED_DIMS = 1536;

// OpenAI's per-request input cap for `embeddings.create` (`openai/text-
// embedding-3-small` is in the 2048-bracket of the embeddings API). Direct
// embedding activities chunk requests at this limit; hoisting it here keeps
// them consistent. Verify when bumping the embedding
// model — the cap is per-model and the relevant docs are at
// https://platform.openai.com/docs/api-reference/embeddings/create.
export const EMBED_MAX_INPUTS = 2_048;

/**
 * OpenRouter-specific request body extras. Merged into a chat request only on
 * the `via: 'openrouter'` path (the admin LLM-eval page and the content-filter
 * fallback) by `createChatCompletionTracked` — never sent to OpenAI direct,
 * which rejects unknown body fields.
 *
 *   - `provider.order: ['cloudflare', 'nextbit', 'siliconflow', 'parasail', 'novita']` —
 *     preferred provider list for multi-provider models (open-weight
 *     Llama / Qwen / DeepSeek-style routings). OpenRouter tries each in
 *     order, then falls back to other providers (`allow_fallbacks`
 *     defaults to true). These five consistently offer the best
 *     per-token pricing for the models we route, with reasonable
 *     throughput. Single-provider models (`openai/...`, `anthropic/...`,
 *     `deepseek/...` direct) ignore this and use their sole provider.
 *   - `provider.sort: 'price'` — fallback-ordering strategy after the
 *     `order` list is exhausted: cheapest first. Belt-and-suspenders for
 *     the case where none of the listed providers serves the requested
 *     model.
 *   - `usage.include: true` — adds `usage.cost` (USD spend for the call)
 *     to the response, which the admin LLM-eval surface displays
 *     per-model.
 *
 * `createChatCompletionTracked` casts the merged body because these fields
 * aren't part of the OpenAI schema the SDK ships with.
 */
export const openrouterExtras = {
  provider: {
    order: ['cloudflare', 'nextbit', 'siliconflow', 'parasail', 'novita'],
    sort: 'price',
  },
  usage: { include: true },
} as const;

export type StartLlmCallArgs = {
  model: string;
  activity: string;
  uploadRecordId?: string | null;
};

export type StartedLlmCall = {
  id: string;
  model: string;
  startedAt: Date;
};

/**
 * Insert one `llm_call` audit row. Called by activity code right after a
 * chat-completion response comes back — including the cases where
 * downstream guards (silent-summarization, content-filter) reject the
 * response and throw. The tokens were billed by the provider either way,
 * and the failure paths are exactly when we most want a record.
 *
 * Token counts come straight from `completion.usage`. Computed cost runs
 * `tokens × MODEL_PRICING[model] @ now` (see `llm-pricing.ts`); null when
 * the model isn't in the table — log loudly when that happens so the
 * pricing gap doesn't fester. Provider cost is OpenRouter's
 * `usage.cost`, kept as a reconciliation check against our table.
 */
export type RecordLlmCallArgs = {
  model: string;
  /** Logical activity tag: 'annotateTranscript', 'summarizeUpload', 'evalAnnotate', … */
  activity: string;
  uploadRecordId?: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens?: number | null;
  providerCostUsd?: number | null;
  durationMs: number;
  finishReason?: string | null;
  /**
   * Disposition. 'success' on the happy path; 'guard_length_truncation',
   * 'guard_content_filter', 'guard_silent_summarization',
   * 'guard_empty_content', 'create_failed', or another 'guard_*' tag
   * when an activity-side guard rejected the response. Stored verbatim
   * — new guards don't need a schema change. Required so the column's
   * NOT NULL default never silently fills in the wrong value.
   */
  outcome: string;
  /** Failure detail mirroring the thrown Error message. Null on success. */
  errorMessage?: string | null;
  /**
   * The model's full, verbatim response text (chat completion
   * `choices[0].message.content`). Persisted so the complete raw
   * completion survives the activity's lossy parse-to-structured-rows
   * step. Null/omitted for embeddings (vector, not text) and for the
   * failure paths with no response body.
   */
  responseText?: string | null;
  /**
   * Multiplier applied to table-computed cost. Flex responses pass 0.5 because
   * OpenAI prices them at Batch rates without marking them as Batch API calls.
   */
  costMultiplier?: number;
  /** Override the clock for tests / backfills. Defaults to `new Date()`. */
  at?: Date;
};

export type CompleteLlmCallArgs = Omit<
  RecordLlmCallArgs,
  'activity' | 'at' | 'model' | 'uploadRecordId'
>;

function completedLlmCallValues(
  model: string,
  at: Date,
  args: CompleteLlmCallArgs,
) {
  const costMultiplier = args.costMultiplier ?? 1;
  const computedRaw =
    args.promptTokens != null && args.completionTokens != null
      ? computeCost(
          model,
          args.promptTokens,
          args.completionTokens,
          args.cachedTokens ?? null,
          at,
        )
      : null;
  const computed = computedRaw === null ? null : computedRaw * costMultiplier;
  return {
    promptTokens: args.promptTokens,
    completionTokens: args.completionTokens,
    cachedTokens: args.cachedTokens ?? null,
    computedCostUsd: computed === null ? null : computed.toString(),
    providerCostUsd:
      args.providerCostUsd == null ? null : args.providerCostUsd.toString(),
    durationMs: args.durationMs,
    finishReason: args.finishReason ?? null,
    outcome: args.outcome,
    errorMessage: args.errorMessage ?? null,
    responseText: args.responseText ?? null,
  };
}

/**
 * Persist request intent before any provider I/O. A row that remains
 * `outcome='started'` identifies a process exit during an in-flight call.
 */
export async function startLlmCall(
  args: StartLlmCallArgs,
): Promise<StartedLlmCall> {
  const startedAt = new Date();
  const [row] = await db
    .insert(LlmCall)
    .values({
      model: args.model,
      activity: args.activity,
      uploadRecordId: args.uploadRecordId ?? null,
      durationMs: 0,
      outcome: 'started',
      createdAt: startedAt,
    })
    .returning({ id: LlmCall.id });
  if (!row) throw new Error('Failed to create llm_call start record');
  return { id: row.id, model: args.model, startedAt };
}

/** Settle a row created by `startLlmCall` without changing its start identity. */
export async function completeLlmCall(
  started: StartedLlmCall,
  args: CompleteLlmCallArgs,
): Promise<void> {
  await db
    .update(LlmCall)
    .set(completedLlmCallValues(started.model, started.startedAt, args))
    .where(eq(LlmCall.id, started.id));
}

async function settleStartedLlmCall(
  started: StartedLlmCall | null,
  args: CompleteLlmCallArgs,
): Promise<void> {
  if (!started) return;
  try {
    await completeLlmCall(started, args);
  } catch (error) {
    // The durable `started` row is preferable to retrying a provider call that
    // already completed. Surface the audit gap without duplicating LLM spend.
    moduleLogger.error('Failed to settle llm_call audit row', {
      error,
      llmCallId: started.id,
      model: started.model,
    });
  }
}

/**
 * Wrapper around `llm.chat.completions.create` that owns everything every
 * LLM-calling activity needs to do identically: timing, usage extraction,
 * empty-content guarding, audit-log insertion (always, including on
 * thrown create() and downstream guard failures), and final throw when
 * the activity-specific guard reports an error.
 *
 * Activity-specific guards run via the `guards` callback. The callback
 * receives the parsed completion and returns `{ outcome, errorMessage }`.
 * Returning `errorMessage: null` (any non-null `outcome`, e.g.
 * `'success'`) records the row and returns the completion. Returning a
 * non-null `errorMessage` records the row AND throws an Error — the
 * activity body doesn't have to remember to throw itself.
 *
 * Built-in guards run before the callback:
 *   - `finish_reason === 'length'`            → `guard_length_truncation`
 *   - `finish_reason === 'content_filter'`    → `guard_content_filter`
 *   - empty `choices[0].message.content`      → `guard_empty_content`
 *   - `llm.chat.completions.create` throws    → `create_failed` (token
 *     counts are null because the SDK doesn't expose usage on a throw,
 *     but a row still lands so the failure shows up in audit
 *     aggregates).
 *
 * Temporal activity retries each create their own completion + their own
 * row (intentional: each retry is a separately billable call). Do not
 * dedupe `llm_call` rows by `(activity, upload_record_id)` downstream.
 */
export type { GuardOutcome } from './llm-completion-guards';

export type CreateTrackedChatCompletionArgs =
  OpenAI.ChatCompletionCreateParamsNonStreaming & {
    /**
     * Set to record the call in `llm_call`. Omit only from one-off
     * scripts and tests where audit noise is undesirable.
     */
    tracking?: { activity: string; uploadRecordId?: string | null };
    /**
     * Activity-specific guard run after the built-in guards pass. Use
     * for content checks the wrapper can't know about (e.g. the
     * silent-summarization guard in `annotate-transcript.ts` that
     * compares `completion_tokens` to the input transcript's
     * estimated tokens). Return `{ outcome: 'success', errorMessage: null }`
     * for the happy path, or `{ outcome: 'guard_*', errorMessage: '…' }`
     * to fail the call. Omit when no activity-specific guard applies.
     */
    guards?: (
      completion: OpenAI.ChatCompletion,
    ) => GuardOutcome | Promise<GuardOutcome>;
    /**
     * Optional fallback model to retry against if the primary trips
     * `guard_content_filter` (provider content filter blocked the
     * response). Used by annotate for OpenAI's classifier rejecting
     * politically/theologically frank content; the fallback is routed
     * to a different provider on OpenRouter. The primary's failed call
     * is still recorded in `llm_call`, so an audit trail of both
     * attempts lands. Set to null/undefined to disable fallback (the
     * wrapper throws `guard_content_filter` as before).
     *
     * Only `content_filter` triggers the fallback — `length`,
     * `empty_content`, and activity-specific guards are different
     * problems (prompt too big, broken response) and shouldn't silently
     * switch models.
     */
    fallbackModel?: string | null;
    /**
     * Which provider to call. `'openai'` (default) hits OpenAI directly: the
     * `openai/` prefix is stripped from `model` and no OpenRouter body extras
     * are sent. `'openrouter'` routes through OpenRouter (model id kept verbatim,
     * `openrouterExtras` merged in) — used only by the admin LLM-eval page and
     * the content-filter fallback. `model` is still recorded canonically
     * (`openai/…`) in `llm_call` either way, so cost lookups don't care.
     */
    via?: 'openai' | 'openrouter';
  };

export async function createChatCompletionTracked(
  args: CreateTrackedChatCompletionArgs,
): Promise<OpenAI.ChatCompletion> {
  return createChatCompletionTrackedAttempt(args, false);
}

async function createChatCompletionTrackedAttempt(
  args: CreateTrackedChatCompletionArgs,
  isFallbackAttempt: boolean,
): Promise<OpenAI.ChatCompletion> {
  const {
    tracking,
    guards,
    fallbackModel,
    via = 'openai',
    service_tier: serviceTier,
    ...createArgs
  } = args;
  if (
    serviceTier === 'flex' &&
    (via !== 'openai' ||
      !tracking ||
      !FLEX_BACKGROUND_ACTIVITIES[tracking.activity])
  ) {
    throw new Error(
      'OpenAI Flex is restricted to tracked background annotation and summary activities',
    );
  }

  const startedCall = tracking
    ? await startLlmCall({
        model: createArgs.model,
        activity: tracking.activity,
        uploadRecordId: tracking.uploadRecordId,
      })
    : null;
  const t0 = Date.now();

  // Send a bare model id + no extras to OpenAI direct; keep the verbatim id +
  // OpenRouter routing extras for the OpenRouter path. `createArgs.model` (the
  // canonical, possibly-prefixed id) is what we record below, regardless.
  // `service_tier` is intentionally omitted from OpenRouter fallbacks.
  const requestBody = (
    via === 'openrouter'
      ? { ...createArgs, ...openrouterExtras }
      : {
          ...createArgs,
          model: stripOpenaiPrefix(createArgs.model),
          service_tier: serviceTier,
        }
  ) as OpenAI.ChatCompletionCreateParamsNonStreaming;
  const client = via === 'openrouter' ? openrouterClient : openaiClient;

  let completion: OpenAI.ChatCompletion;
  try {
    completion = await client.chat.completions.create(
      requestBody,
      isFallbackAttempt
        ? {
            // One fallback invocation must mean one OpenRouter HTTP request.
            // Temporal owns durable retries and records each attempt separately.
            maxRetries: 0,
          }
        : via === 'openai' && serviceTier === 'flex'
          ? {
              // Flex can legitimately take up to the configured one-hour
              // timeout. Temporal, not the SDK, owns retries across days.
              timeout: FLEX_REQUEST_TIMEOUT_MS,
              maxRetries: 0,
            }
          : undefined,
    );
  } catch (err) {
    await settleStartedLlmCall(startedCall, {
      promptTokens: null,
      completionTokens: null,
      providerCostUsd: null,
      durationMs: Date.now() - t0,
      finishReason: null,
      outcome: 'create_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const durationMs = Date.now() - t0;
  const choice = completion.choices[0];
  const completionAudit = {
    promptTokens: completion.usage?.prompt_tokens ?? null,
    completionTokens: completion.usage?.completion_tokens ?? null,
    providerCostUsd:
      (completion.usage as unknown as { cost?: number } | undefined)?.cost ??
      null,
    costMultiplier: completion.service_tier === 'flex' ? 0.5 : 1,
    durationMs,
    finishReason: choice?.finish_reason ?? null,
    responseText: choice?.message.content ?? null,
  };

  // Built-in guards run first. Activity-specific `guards` callback only
  // sees the completion if all built-ins passed.
  let result: GuardOutcome;
  try {
    result =
      getBuiltInCompletionGuard(choice) ??
      (guards
        ? await guards(completion)
        : { outcome: 'success', errorMessage: null });
  } catch (err) {
    await settleStartedLlmCall(startedCall, {
      ...completionAudit,
      outcome: 'guard_evaluation_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await settleStartedLlmCall(startedCall, {
    ...completionAudit,
    outcome: result.outcome,
    errorMessage: result.errorMessage,
  });

  if (result.errorMessage) {
    // A provider content-filter rejection gets one different-model fallback.
    // The recursive call is marked so it disables SDK retries and can classify
    // deterministic output-cap/completeness failures as non-retryable.
    if (result.outcome === 'guard_content_filter' && fallbackModel) {
      return createChatCompletionTrackedAttempt(
        {
          ...createArgs,
          model: fallbackModel,
          via: 'openrouter',
          tracking,
          guards,
          fallbackModel: null,
        },
        true,
      );
    }
    if (isFallbackAttempt && isDeterministicFallbackOutcome(result.outcome)) {
      throw ApplicationFailure.nonRetryable(
        result.errorMessage,
        DETERMINISTIC_LLM_FALLBACK_FAILURE,
        { model: createArgs.model, outcome: result.outcome },
      );
    }
    throw new Error(result.errorMessage);
  }

  return completion;
}

/**
 * Embeddings equivalent of `createChatCompletionTracked`. Embedding
 * calls have no `finish_reason` and no choices — just `usage` and the
 * vector(s). Only built-in guard is `create_failed` (SDK throw); add a
 * `guards` callback if you need content-level checks (e.g. dim mismatch
 * is still done inline in the activity since it's not really a billing
 * concern).
 */
export type CreateTrackedEmbeddingArgs = OpenAI.EmbeddingCreateParams & {
  tracking?: { activity: string; uploadRecordId?: string | null };
};

export async function createEmbeddingsTracked(
  args: CreateTrackedEmbeddingArgs,
): Promise<OpenAI.CreateEmbeddingResponse> {
  const { tracking, ...createArgs } = args;
  const model =
    typeof createArgs.model === 'string'
      ? createArgs.model
      : String(createArgs.model);
  const startedCall = tracking
    ? await startLlmCall({
        model,
        activity: tracking.activity,
        uploadRecordId: tracking.uploadRecordId,
      })
    : null;
  const t0 = Date.now();

  let res: OpenAI.CreateEmbeddingResponse;
  try {
    // OpenAI direct: bare model id (strip the canonical `openai/` prefix).
    res = await openaiClient.embeddings.create({
      ...createArgs,
      model: stripOpenaiPrefix(model),
    });
  } catch (err) {
    await settleStartedLlmCall(startedCall, {
      promptTokens: null,
      completionTokens: null,
      providerCostUsd: null,
      durationMs: Date.now() - t0,
      finishReason: null,
      outcome: 'create_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await settleStartedLlmCall(startedCall, {
    // Embeddings have no completion tokens; use 0 so cost calculation runs
    // against the model's zero output-token price.
    promptTokens: res.usage?.prompt_tokens ?? null,
    completionTokens: 0,
    providerCostUsd: null,
    durationMs: Date.now() - t0,
    finishReason: null,
    outcome: 'success',
    errorMessage: null,
  });

  return res;
}

/**
 * Insert one already-completed `llm_call` directly. Provider call sites should
 * use `startLlmCall` before I/O and `completeLlmCall` afterward; this helper is
 * retained for historical backfills and callers that only receive final usage.
 */
export async function recordLlmCall(args: RecordLlmCallArgs): Promise<void> {
  const at = args.at ?? new Date();
  await db.insert(LlmCall).values({
    model: args.model,
    activity: args.activity,
    uploadRecordId: args.uploadRecordId ?? null,
    ...completedLlmCallValues(args.model, at, args),
    createdAt: at,
  });
}
