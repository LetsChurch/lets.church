import { db, LlmCall } from '@letschurch/db';
import OpenAI from 'openai';
import { z } from 'zod';
import { computeCost } from './llm-pricing';

const env = z
  .object({
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_SUMMARY_MODEL: z.string().default('openai/gpt-5.4-mini'),
    // Annotation defaults to gpt-5.4-mini. The full-doc markdown-output
    // approach (paragraph-echo + inline links, see annotate-transcript.ts)
    // is the only output format the activity supports; the earlier
    // strict-JSON-schema path that ran into OpenAI's response-side
    // safety classifier was retired with that rewrite. Temperature 0.6
    // + the silent-summarization guard in the activity together close
    // the residual variance we measured during prompt tuning.
    OPENROUTER_ANNOTATE_MODEL: z.string().default('openai/gpt-5.4-mini'),
    // Fallback model for annotate when the primary's response is blocked by
    // the provider content filter (finish_reason=content_filter). Routed via
    // OpenRouter to a non-OpenAI provider so the same content that tripped
    // OpenAI's classifier has a chance to land. Empty string disables the
    // fallback (the activity throws guard_content_filter as before).
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

// One OpenAI-SDK client pointed at OpenRouter. Covers both
// `chat.completions` (summarization) and `embeddings`: OpenRouter routes
// `openai/text-embedding-3-small` to OpenAI at the same $0.02/1M with no
// markup. SDK built-in exponential backoff handles 429/5xx; we bump from the
// default 2 → 5 attempts. Temporal activity retry sits on top of that.
export const llm = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  maxRetries: 5,
});

// Env-configurable: safe to swap because changing the chat model only affects
// new output. Default is the cheap mini tier (~$0.00075/$0.0045 per 1M tok);
// override via `OPENROUTER_SUMMARY_MODEL` for `openai/gpt-5.4-nano` (cheaper)
// or `openai/gpt-5.4` / `openai/gpt-5.5` (better).
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
 * OpenRouter-specific request body extras spread into every background LLM
 * call (chat completions + embeddings).
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
 * Cast to `Record<string, unknown>` at the call site because these fields
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
export type GuardOutcome = {
  outcome: string;
  errorMessage: string | null;
};

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
  };

export async function createChatCompletionTracked(
  args: CreateTrackedChatCompletionArgs,
): Promise<OpenAI.ChatCompletion> {
  const { tracking, guards, fallbackModel, ...createArgs } = args;
  const t0 = Date.now();

  let completion: OpenAI.ChatCompletion;
  try {
    completion = await llm.chat.completions.create(createArgs);
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
  let result: GuardOutcome;
  if (choice?.finish_reason === 'length') {
    result = {
      outcome: 'guard_length_truncation',
      errorMessage: `Model output exceeded max_tokens (finish_reason=length) — try a model with a higher output cap or shrink the prompt`,
    };
  } else if (choice?.finish_reason === 'content_filter') {
    result = {
      outcome: 'guard_content_filter',
      errorMessage:
        'Model response was blocked by the provider content filter (finish_reason=content_filter)',
    };
  } else if (
    // Empty content is a failure for text-only flows. Tool-calling
    // responses legitimately set `message.content = ''` (or null) with
    // populated `tool_calls`, so don't trip the guard in that case.
    !choice?.message.content &&
    !(choice?.message.tool_calls && choice.message.tool_calls.length > 0)
  ) {
    result = {
      outcome: 'guard_empty_content',
      errorMessage:
        'Model returned no content (empty `choices[0].message.content` and no tool_calls)',
    };
  } else {
    result = guards
      ? await guards(completion)
      : { outcome: 'success', errorMessage: null };
  }

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
    // provider classifier blocks the response. Recurse with the fallback
    // model swapped in + `fallbackModel: null` so we only ever switch once
    // per request. All other failure modes (length, empty, custom guards)
    // throw normally — switching models there would mask different
    // underlying bugs.
    if (result.outcome === 'guard_content_filter' && fallbackModel) {
      return createChatCompletionTracked({
        ...createArgs,
        model: fallbackModel,
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
    res = await llm.embeddings.create(createArgs);
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
      // (`openai/text-embedding-3-small`, which OpenRouter routes
      // direct-to-vendor and doesn't populate `usage.cost` for).
      promptTokens: res.usage?.prompt_tokens ?? null,
      completionTokens: 0,
      // OpenRouter populates `usage.cost` on embedding responses for
      // many routings — mirror the chat-path expression rather than
      // hardcoding null. `resolveCostUsd` downstream prefers this
      // value when present and positive.
      providerCostUsd:
        (res.usage as unknown as { cost?: number } | undefined)?.cost ?? null,
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
