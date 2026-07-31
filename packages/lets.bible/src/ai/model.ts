import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// LLM config for the search-answer feature. Calls OpenAI directly with the Vercel
// AI SDK (`streamText`) — no agent framework. Env-configurable model id, stored
// canonically as `openai/…` for audit/pricing.
const { OPENAI_API_KEY, LETS_BIBLE_ANSWER_MODEL, LETS_BIBLE_PARSE_MODEL } = z
  .object({
    OPENAI_API_KEY: z.string().trim().min(1),
    LETS_BIBLE_ANSWER_MODEL: z.string().default('openai/gpt-5.6-luna'),
    // Parse model for the deterministic-then-model gates (is this a verse
    // recollection worth the detective loop? is this even a Scripture question?).
    // Tunable independently of the answer model, even when both defaults match.
    LETS_BIBLE_PARSE_MODEL: z.string().default('openai/gpt-5.6-luna'),
  })
  .parse(process.env);

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

// Strip the `openai/` prefix for the bare id the OpenAI API expects.
export const answerModel = openai(
  LETS_BIBLE_ANSWER_MODEL.replace(/^openai\//, ''),
);

// Canonical id (kept `openai/…`) for any audit logging.
export const ANSWER_MODEL = LETS_BIBLE_ANSWER_MODEL;

// The gate model used before answer generation / the multi-step detective loop.
export const parseModel = openai(
  LETS_BIBLE_PARSE_MODEL.replace(/^openai\//, ''),
);
export const PARSE_MODEL = LETS_BIBLE_PARSE_MODEL;
