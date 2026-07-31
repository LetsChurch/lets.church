import logger from './logger';

const moduleLogger = logger.child({ module: 'temporal/util/llm-pricing' });

/**
 * Effective-dated price table for OpenRouter models we call.
 *
 * Upstream providers (OpenAI, Anthropic, Google, …) don't return cost in
 * their chat-completion responses — only token counts. OpenRouter computes
 * cost for some of its routings (returned in `usage.cost` when we set
 * `usage: { include: true }`), but coverage is patchy: direct-from-vendor
 * routes (notably anything routed to OpenAI through OpenRouter) frequently
 * come back with `cost: 0` even though the call wasn't free.
 *
 * The reliable thing is the token count. This module turns tokens × the
 * model's published per-million rate into a USD figure we control and can
 * audit, with effective-from dates so historical replays of cost still use
 * the price that was actually charged at the time. When a vendor raises or
 * cuts prices, add a new `PriceWindow` to the model — don't edit existing
 * entries. The `effectiveFrom` window with the most recent date ≤ `at`
 * wins, so older calls keep their historical cost.
 *
 * Caveat: prices below are USD per million tokens per OpenRouter's
 * `/api/v1/models/{id}/endpoints` endpoint at the time the window was
 * added. They match what OpenRouter passes through; if the upstream
 * vendor changes pricing and we forget to update, `LlmCall.computedCostUsd`
 * will drift from `providerCostUsd`. Periodically reconcile.
 */

export type PriceWindow = {
  /** ISO 8601 date (YYYY-MM-DD). Inclusive lower bound. */
  effectiveFrom: string;
  /** USD per 1,000,000 input tokens. */
  inputPerMTokens: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMTokens: number;
  /**
   * USD per 1,000,000 cached input tokens (Anthropic prompt caching, OpenAI
   * cache hit pricing). Omit when the provider doesn't offer cache pricing
   * for this model — `computeCost` falls back to the standard input rate.
   */
  cachedInputPerMTokens?: number;
};

export type ModelPricing = {
  /** OpenRouter model id, e.g. 'openai/gpt-5.6-luna'. */
  model: string;
  /** Windows in any order — `priceFor` sorts them when picking the active one. */
  windows: PriceWindow[];
};

/**
 * Add a window to a model when its price changes. Do not edit existing
 * windows — the historical record stays accurate when we don't.
 */
export const MODEL_PRICING: ModelPricing[] = [
  {
    // Production annotate + summarize model. `effectiveFrom` is the date
    // we landed on these prices on OpenRouter for this model; bump when
    // they change rather than overwriting.
    model: 'openai/gpt-5.6-luna',
    windows: [
      {
        effectiveFrom: '2026-05-01',
        inputPerMTokens: 0.4,
        outputPerMTokens: 1.6,
        cachedInputPerMTokens: 0.1,
      },
    ],
  },
  {
    // Annotate fallback model — fires only when OpenAI's content filter
    // rejects the gpt-5.6-luna response. Listed so the (relatively rare)
    // fallback calls land with a populated `computed_cost_usd` instead of
    // null. Cached input pricing isn't exposed via OpenRouter.
    model: 'anthropic/claude-haiku-4-5',
    windows: [
      {
        effectiveFrom: '2026-05-01',
        inputPerMTokens: 1.0,
        outputPerMTokens: 5.0,
      },
    ],
  },
  {
    // Production embedding model (hardcoded in util/llm.ts).
    model: 'openai/text-embedding-3-small',
    windows: [
      {
        effectiveFrom: '2026-05-01',
        // Embeddings have no completion tokens — output rate of 0 keeps
        // `computeCost` correct.
        inputPerMTokens: 0.02,
        outputPerMTokens: 0,
      },
    ],
  },
];

/**
 * Boot-time sanity check: log a loud warning if any model the activity
 * stack expects to call isn't in `MODEL_PRICING`. The `llm_call` table
 * accepts unknown models (just records `computed_cost_usd = null` and
 * a per-call warn), but the cost dashboards silently lose those rows
 * from spend totals — an operator who never reads the per-call logs
 * has no way to notice. This check surfaces the gap at process start.
 *
 * `EMBED_MODEL` is hardcoded; `OPENROUTER_SUMMARY_MODEL` and
 * `OPENROUTER_ANNOTATE_MODEL` are env-configurable, and the eval
 * surface routes to arbitrary user-supplied ids (we don't try to cover
 * those — `computeCost` warns per call instead).
 */
export function assertProductionPricingCoverage(modelIds: {
  summary: string;
  annotate: string;
  embed: string;
}): void {
  const missing: string[] = [];
  for (const [label, id] of Object.entries(modelIds)) {
    if (!MODEL_PRICING.some((e) => e.model === id)) {
      missing.push(`${label}=${id}`);
    }
  }
  if (missing.length > 0) {
    moduleLogger.warn(
      { context: { missing } },
      'Production LLM models are not in MODEL_PRICING — `llm_call.computed_cost_usd` will be null on every call. Add windows in util/llm-pricing.ts.',
    );
  }
}

/** Find the active price window for `model` as of `at`, or null if unknown. */
export function priceFor(model: string, at: Date): PriceWindow | null {
  const entry = MODEL_PRICING.find((e) => e.model === model);
  if (!entry) return null;
  const atIso = at.toISOString().slice(0, 10);
  const active = entry.windows
    .filter((w) => w.effectiveFrom <= atIso)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return active ?? null;
}

/**
 * Compute USD cost for one chat-completion call. Returns null when the
 * model isn't in `MODEL_PRICING` — and logs a warning, so a missing
 * entry surfaces in observability instead of silently degrading the
 * audit log. `cachedTokens`, when provided, are billed at the cache rate
 * and deducted from `promptTokens`. `at` defaults to now.
 */
export function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number | null = null,
  at: Date = new Date(),
): number | null {
  const price = priceFor(model, at);
  if (!price) {
    moduleLogger.warn(
      {
        context: {
          model,
          at: at.toISOString(),
          promptTokens,
          completionTokens,
        },
      },
      'No active price window in MODEL_PRICING — add an entry in util/llm-pricing.ts',
    );
    return null;
  }
  const cached = cachedTokens ?? 0;
  const uncachedInput = Math.max(0, promptTokens - cached);
  const inputCost = (uncachedInput * price.inputPerMTokens) / 1_000_000;
  const cachedCost =
    (cached * (price.cachedInputPerMTokens ?? price.inputPerMTokens)) /
    1_000_000;
  const outputCost = (completionTokens * price.outputPerMTokens) / 1_000_000;
  return inputCost + cachedCost + outputCost;
}

/**
 * Resolve the cost of one chat-completion call for surfaces that need a
 * single number (the eval-page badge, the activity stats, etc).
 *
 * OpenRouter reports `usage.cost` for some routings (multi-provider
 * open-weight routes — gemma, llama-on-Cloudflare, etc.) but returns
 * `null` or `0` for direct-from-vendor routes (`openai/*`, `anthropic/*`,
 * `google/*`). Using `providerCostUsd` blindly makes the badge read "$0"
 * on every production gpt-5.6-luna call. Use the provider value only
 * when it's present AND positive; otherwise fall back to our table.
 */
export function resolveCostUsd(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
  providerCostUsd: number | null,
  at: Date = new Date(),
): number | null {
  if (providerCostUsd != null && providerCostUsd > 0) return providerCostUsd;
  if (promptTokens == null || completionTokens == null) return null;
  return computeCost(model, promptTokens, completionTokens, null, at);
}
