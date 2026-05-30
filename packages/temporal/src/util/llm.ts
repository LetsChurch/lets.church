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

// Hardcoded — NOT env-configurable. Changing the embedding model invalidates
// every stored vector because cross-model cosine similarity is meaningless.
// The `openai/` prefix is part of OpenRouter's id and stays here.
export const EMBED_MODEL = 'openai/text-embedding-3-small';
export const EMBED_DIMS = 1536;

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
  };

export async function createChatCompletionTracked(
  args: CreateTrackedChatCompletionArgs,
): Promise<OpenAI.ChatCompletion> {
  const { tracking, guards, ...createArgs } = args;
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
    });
  }

  if (result.errorMessage) {
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
  const computed =
    args.promptTokens != null && args.completionTokens != null
      ? computeCost(
          args.model,
          args.promptTokens,
          args.completionTokens,
          args.cachedTokens ?? null,
          at,
        )
      : null;
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
    createdAt: at,
  });
}
