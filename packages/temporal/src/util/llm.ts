import OpenAI from 'openai';
import { z } from 'zod';

const env = z
  .object({
    OPENROUTER_API_KEY: z.string().min(1),
    OPENROUTER_SUMMARY_MODEL: z.string().default('openai/gpt-5.4-mini'),
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

// Hardcoded — NOT env-configurable. Changing the embedding model invalidates
// every stored vector because cross-model cosine similarity is meaningless.
// The `openai/` prefix is part of OpenRouter's id and stays here.
export const EMBED_MODEL = 'openai/text-embedding-3-small';
export const EMBED_DIMS = 1536;
