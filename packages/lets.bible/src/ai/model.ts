import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

// LLM config for the search-answer feature. Calls OpenAI directly with the Vercel
// AI SDK (`streamText`) — no agent framework. Env-configurable model id, stored
// canonically as `openai/…` for audit/pricing; the default mini tier is plenty
// for grounded Scripture Q&A.
const { OPENAI_API_KEY, LETS_BIBLE_ANSWER_MODEL } = z
  .object({
    OPENAI_API_KEY: z.string().trim().min(1),
    LETS_BIBLE_ANSWER_MODEL: z.string().default('openai/gpt-5.4-mini'),
  })
  .parse(process.env);

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

// Strip the `openai/` prefix for the bare id the OpenAI API expects.
export const answerModel = openai(
  LETS_BIBLE_ANSWER_MODEL.replace(/^openai\//, ''),
);

// Canonical id (kept `openai/…`) for any audit logging.
export const ANSWER_MODEL = LETS_BIBLE_ANSWER_MODEL;
