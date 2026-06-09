import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

const { OPENROUTER_API_KEY, OPENROUTER_SEARCH_AGENT_MODEL } = z
  .object({
    OPENROUTER_API_KEY: z.string().trim().min(1),
    // The answer-generation model for the search agent. Env-configurable; the
    // default mini tier is plenty for grounded RAG over retrieved passages.
    OPENROUTER_SEARCH_AGENT_MODEL: z.string().default('openai/gpt-5.4-mini'),
  })
  .parse(process.env);

const openrouter = createOpenRouter({ apiKey: OPENROUTER_API_KEY });

// Reuses the same OpenRouter account/key as the background LLM pipeline.
export const agentModel = openrouter(OPENROUTER_SEARCH_AGENT_MODEL);

// Exported so the answer route can attribute its `llm_call` audit row to the
// right model (Mastra owns the actual request, so we log it manually).
export const SEARCH_AGENT_MODEL = OPENROUTER_SEARCH_AGENT_MODEL;
