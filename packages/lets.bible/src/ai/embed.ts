import { createOpenAI } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';

// Text embeddings for hybrid (lexical + semantic) verse search. Model and
// dimension are HARDCODED — changing either requires destroying + rebuilding the
// verse index (the mapping's `dimension` is fixed and stored vectors are
// model-specific). lets.bible uses `text-embedding-3-large` (3072-d) rather than
// the web app's `text-embedding-3-small` (1536-d): the verse corpus is tiny
// (~3 GB of vectors), so the larger dimension is cheap, and 3-large's stronger
// retrieval ranks paraphrase targets higher (e.g. "they meant bad but God meant
// good" → Genesis 50:20 at #1, vs #2 with 3-small). If you change EMBED_DIMS,
// update the `embedding` mapping `dimension` in search/mappings.ts to match.
// Calls OpenAI directly via the Vercel AI SDK, reusing the answer feature's key.
export const EMBED_MODEL = 'text-embedding-3-large';
export const EMBED_DIMS = 3072;

// OpenAI caps a single embeddings request at 2048 inputs; chunk verse batches
// at this size when indexing.
const EMBED_MAX_INPUTS = 2048;

// Constructed lazily-at-module-load: when OPENAI_API_KEY is unset (e.g. bare
// local dev), `model` is null and callers degrade to lexical-only search rather
// than throwing — mirroring the optional Valkey cache.
const apiKey = process.env.OPENAI_API_KEY;
const model = apiKey
  ? createOpenAI({ apiKey }).textEmbeddingModel(EMBED_MODEL)
  : null;

export function embeddingsEnabled(): boolean {
  return model !== null;
}

// Embed a single query string. Returns null when embeddings are disabled (no
// API key), so the hybrid search can fall back to its lexical query.
export async function embedQuery(text: string): Promise<number[] | null> {
  if (!model) {
    return null;
  }
  const { embedding } = await embed({ model, value: text });
  return embedding;
}

// Embed many texts, chunked at the OpenAI per-request cap, order-preserving.
// Throws if embeddings are disabled — the indexer decides whether to require
// them (it skips the vector field when the key is absent).
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!model) {
    throw new Error('OPENAI_API_KEY is required to embed verse texts');
  }
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_MAX_INPUTS) {
    const { embeddings } = await embedMany({
      model,
      // OpenAI rejects empty/whitespace-only inputs. A few verses are empty in
      // some versifications (a verse slot with no text in this translation), so
      // substitute a placeholder to keep the batch (and its index alignment)
      // intact — those degenerate verses just get a meaningless vector.
      values: texts
        .slice(i, i + EMBED_MAX_INPUTS)
        .map((t) => (t.trim().length > 0 ? t : '(no text)')),
    });
    out.push(...embeddings);
  }
  return out;
}
