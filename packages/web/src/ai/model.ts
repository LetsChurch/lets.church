import { createOpenAI } from '@ai-sdk/openai';
import { initAiTelemetry } from '@letschurch/util/server/ai-telemetry';
import { z } from 'zod';

const { OPENAI_API_KEY, OPENROUTER_SEARCH_AGENT_MODEL } = z
  .object({
    OPENAI_API_KEY: z.string().trim().min(1),
    // The answer-generation model for the search agent. Env-configurable.
    // Kept under the OPENROUTER_* name (it only holds a model id) to avoid a
    // deploy-config rename; the value is the canonical `openai/…` form.
    OPENROUTER_SEARCH_AGENT_MODEL: z.string().default('openai/gpt-5.6-luna'),
  })
  .parse(process.env);
initAiTelemetry({ serviceName: 'lets.church-web' });

// Calls OpenAI directly, in step with the rest of the production pipeline.
// OpenRouter is reserved for the admin LLM-eval page.
const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

// The model id is stored canonically (`openai/…`) for audit/pricing; strip the
// prefix for the bare id the OpenAI API expects.
export const agentModel = openai(
  OPENROUTER_SEARCH_AGENT_MODEL.replace(/^openai\//, ''),
);

// Exported so the answer route can attribute its `llm_call` audit row to the
// right model (Mastra owns the actual request, so we log it manually). Kept
// canonical (`openai/…`) so it matches the pricing table.
export const SEARCH_AGENT_MODEL = OPENROUTER_SEARCH_AGENT_MODEL;
