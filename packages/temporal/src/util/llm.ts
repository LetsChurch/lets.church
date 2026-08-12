import { db, LlmCall } from '@letschurch/db';
import OpenAI from 'openai';
import { z } from 'zod';

import {
  getBuiltInCompletionGuard,
  type GuardOutcome,
} from './llm-completion-guards';
import { computeCost } from './llm-pricing';

const openaiBatchModel = z
  .string()
  .startsWith(
    'openai/',
    'Production Batch API models must use the canonical openai/* id',
  );

const env = z
  .object({
    // Primary production processing goes through OpenAI Batch. OpenRouter is
    // used by the admin LLM-eval page, legacy live workflow replays, and the
    // live Anthropic fallback after a Batch content-filter response.
    OPENAI_API_KEY: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_SUMMARY_MODEL: openaiBatchModel.default('openai/gpt-5.6-luna'),
    // Annotation defaults to gpt-5.6-luna. The full-doc markdown-output
    // approach (paragraph-echo + inline links, see annotate-transcript.ts)
    // is the only output format the activity supports; the earlier
    // strict-JSON-schema path that ran into OpenAI's response-side
    // safety classifier was retired with that rewrite. Sampling parameters
    // stay at the provider default because supported overrides vary by model.
    OPENROUTER_ANNOTATE_MODEL: openaiBatchModel.default('openai/gpt-5.6-luna'),
    // Fallback for annotate when the primary's response is blocked by the
    // provider content filter. Live calls switch inside the tracked-completion
    // wrapper; the OpenAI Batch output handler makes the equivalent live
    // OpenRouter call after recording the rejected Batch response.
    OPENROUTER_ANNOTATE_FALLBACK_MODEL: z
      .string()
      .default('anthropic/claude-haiku-4-5'),
    // Same content_filter fallback for the summarize activity. Separate env
    // so an operator can pick a different fallback per task (e.g. cheaper
    // for summarize, higher-quality for annotate).
    OPENROUTER_SUMMARY_FALLBACK_MODEL: z
      .string()
      .default('anthropic/claude-haiku-4-5'),
  })
  .parse(process.env);

// Production client — OpenAI direct (default baseURL https://api.openai.com/v1).
// Used for every live chat completion + embedding. SDK built-in exponential
// backoff handles 429/5xx; we bump from the default 2 → 5 attempts. Temporal
// activity retry sits on top of that.
export const openaiClient = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  maxRetries: 5,
});

// OpenRouter client — used by the admin LLM-eval page and live content-filter
// fallback. Primary production processing still uses OpenAI Batch.
export const openrouterClient = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  maxRetries: 5,
});

// Model ids are kept canonical (`openai/…`, the OpenRouter form) everywhere we
// store/aggregate them — env defaults, the pricing table, `llm_call.model` — so
// cost lookups stay stable across the OpenAI/OpenRouter split. When talking to
// OpenAI directly the id must be bare, so we strip the prefix at that one
// boundary (mirrors `openai-batch.ts`, which hits OpenAI direct too).
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
// The `openai/` prefix is part of OpenRouter's id and stays here.
export const EMBED_MODEL = 'openai/text-embedding-3-small';
export const EMBED_DIMS = 1536;

// OpenAI's per-request input cap for `embeddings.create` (`openai/text-
// embedding-3-small` is in the 2048-bracket of the embeddings API). Live
// and batch embed paths both have to chunk requests at this limit;
// hoisted here so they can't drift. Verify when bumping the embedding
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
   * Set when the call was processed via OpenAI's Batch API. Halves the
   * `computedCostUsd` we write (Batch invoices at 50% of live rates)
   * and tags the row so dashboards can split live vs batch spend.
   * Defaults to false for the live path.
   */
  viaBatch?: boolean;
  /** Override the clock for tests / backfills. Defaults to `new Date()`. */
  at?: Date;
};

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
  const {
    tracking,
    guards,
    fallbackModel,
    via = 'openai',
    ...createArgs
  } = args;
  const t0 = Date.now();

  // Send a bare model id + no extras to OpenAI direct; keep the verbatim id +
  // OpenRouter routing extras for the OpenRouter path. `createArgs.model` (the
  // canonical, possibly-prefixed id) is what we record below, regardless.
  const requestBody = (
    via === 'openrouter'
      ? { ...createArgs, ...openrouterExtras }
      : { ...createArgs, model: stripOpenaiPrefix(createArgs.model) }
  ) as OpenAI.ChatCompletionCreateParamsNonStreaming;
  const client = via === 'openrouter' ? openrouterClient : openaiClient;

  let completion: OpenAI.ChatCompletion;
  try {
    completion = await client.chat.completions.create(requestBody);
  } catch (err) {
    if (tracking) {
      await recordLlmCall({
        model: createArgs.model,
        activity: tracking.activity,
        uploadRecordId: tracking.uploadRecordId ?? null,
        promptTokens: null,
        completionTokens: null,
        providerCostUsd: null,
        durationMs: Date.now() - t0,
        finishReason: null,
        outcome: 'create_failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }

  const durationMs = Date.now() - t0;
  const choice = completion.choices[0];

  // Built-in guards run first. Activity-specific `guards` callback only
  // sees the completion if all built-ins passed.
  const builtInGuard = getBuiltInCompletionGuard(choice);
  const result: GuardOutcome =
    builtInGuard ??
    (guards
      ? await guards(completion)
      : { outcome: 'success', errorMessage: null });

  if (tracking) {
    await recordLlmCall({
      model: createArgs.model,
      activity: tracking.activity,
      uploadRecordId: tracking.uploadRecordId ?? null,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
      providerCostUsd:
        (completion.usage as unknown as { cost?: number } | undefined)?.cost ??
        null,
      durationMs,
      finishReason: choice?.finish_reason ?? null,
      outcome: result.outcome,
      errorMessage: result.errorMessage,
      // Retain the verbatim completion text even on guard rejections —
      // a silent-summarization or length-truncated response is exactly
      // what we want to inspect after the fact. Null when the provider
      // returned no content (content_filter / empty_content).
      responseText: choice?.message.content ?? null,
    });
  }

  if (result.errorMessage) {
    // Fallback path: a different model on OpenRouter when the primary's
    // provider classifier blocks the response. Always routed `via: 'openrouter'`
    // — the fallback is a non-OpenAI provider (e.g. anthropic/claude-haiku-4-5)
    // that OpenAI-direct can't reach. Recurse with the fallback model swapped in
    // + `fallbackModel: null` so we only ever switch once per request. All other
    // failure modes (length, empty, custom guards) throw normally — switching
    // models there would mask different underlying bugs.
    if (result.outcome === 'guard_content_filter' && fallbackModel) {
      return createChatCompletionTracked({
        ...createArgs,
        model: fallbackModel,
        via: 'openrouter',
        tracking,
        guards,
        fallbackModel: null,
      });
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
  const t0 = Date.now();

  let res: OpenAI.CreateEmbeddingResponse;
  try {
    // OpenAI direct: bare model id (strip the canonical `openai/` prefix).
    res = await openaiClient.embeddings.create({
      ...createArgs,
      model: stripOpenaiPrefix(
        typeof createArgs.model === 'string'
          ? createArgs.model
          : String(createArgs.model),
      ),
    });
  } catch (err) {
    if (tracking) {
      // Asymmetry with the success path is intentional: failed creates
      // record `completionTokens: null` (no usage block from the SDK),
      // success records `0` (embeddings have no completion tokens but we
      // need a number to satisfy `recordLlmCall`'s computeCost
      // precondition). Combined with `outcome = 'create_failed'`, a
      // future `COUNT(*) WHERE completion_tokens IS NULL` query for
      // embed rows selects only failures — keep the success path
      // emitting 0 so this remains true.
      await recordLlmCall({
        model:
          typeof createArgs.model === 'string'
            ? createArgs.model
            : String(createArgs.model),
        activity: tracking.activity,
        uploadRecordId: tracking.uploadRecordId ?? null,
        promptTokens: null,
        completionTokens: null,
        providerCostUsd: null,
        durationMs: Date.now() - t0,
        finishReason: null,
        outcome: 'create_failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }

  if (tracking) {
    await recordLlmCall({
      model:
        typeof createArgs.model === 'string'
          ? createArgs.model
          : String(createArgs.model),
      activity: tracking.activity,
      uploadRecordId: tracking.uploadRecordId ?? null,
      // Embeddings have no completion tokens; pass 0 (not null) so the
      // `promptTokens != null && completionTokens != null` precondition
      // in `recordLlmCall` is satisfied and `computeCost` runs against
      // the price table's `outputPerMTokens: 0`. Passing null instead
      // would short-circuit cost computation and silently leave
      // `computedCostUsd` empty for the production embed model
      // (`openai/text-embedding-3-small`).
      promptTokens: res.usage?.prompt_tokens ?? null,
      completionTokens: 0,
      // OpenAI direct doesn't return a per-call cost, so provider cost is null
      // and `computedCostUsd` (from the pricing table, keyed on the canonical
      // `openai/text-embedding-3-small`) is the source of truth for embed spend.
      providerCostUsd: null,
      durationMs: Date.now() - t0,
      finishReason: null,
      outcome: 'success',
      errorMessage: null,
    });
  }

  return res;
}

/**
 * Insert one row in `llm_call` directly — for the rare case where the
 * caller already has the tokens / duration outside the
 * `createChatCompletionTracked` / `createEmbeddingsTracked` shape (e.g.
 * backfilling historical data). New activity code should prefer the
 * wrappers.
 */
export async function recordLlmCall(args: RecordLlmCallArgs): Promise<void> {
  const at = args.at ?? new Date();
  const viaBatch = args.viaBatch ?? false;
  // OpenAI Batch invoices at 50% of the posted rate, so we halve the
  // computed cost at write time. `computeCost` itself stays a pure
  // lookup against the pricing table — the multiplier is applied
  // here so the pricing table remains the single source of truth for
  // live rates.
  const computedRaw =
    args.promptTokens != null && args.completionTokens != null
      ? computeCost(
          args.model,
          args.promptTokens,
          args.completionTokens,
          args.cachedTokens ?? null,
          at,
        )
      : null;
  const computed =
    computedRaw === null ? null : viaBatch ? computedRaw * 0.5 : computedRaw;
  await db.insert(LlmCall).values({
    model: args.model,
    activity: args.activity,
    uploadRecordId: args.uploadRecordId ?? null,
    promptTokens: args.promptTokens,
    completionTokens: args.completionTokens,
    cachedTokens: args.cachedTokens ?? null,
    computedCostUsd: computed === null ? null : computed.toString(),
    providerCostUsd:
      args.providerCostUsd == null ? null : args.providerCostUsd.toString(),
    durationMs: args.durationMs,
    finishReason: args.finishReason ?? null,
    // `outcome` is required by `RecordLlmCallArgs` and NOT NULL in the
    // schema. The schema default of 'success' is a belt-and-braces
    // safety net for any direct SQL insert that skips this path; the
    // canonical callers (`createChatCompletionTracked`,
    // `createEmbeddingsTracked`) always pass an explicit value.
    outcome: args.outcome,
    errorMessage: args.errorMessage ?? null,
    responseText: args.responseText ?? null,
    viaBatch,
    createdAt: at,
  });
}
