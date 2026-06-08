import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { z } from 'zod';

const { DATABASE_URL } = z
  .object({ DATABASE_URL: z.string() })
  .parse(process.env);

// Conversation memory for multi-turn follow-ups (pronoun resolution like
// "his view on baptism" -> the pastor from the previous turn). Mastra owns its
// own tables in the existing Postgres (created on first use); no Drizzle
// migration. Threaded by search session, scoped by user/anon resource id.
export const searchMemory = new Memory({
  storage: new PostgresStore({
    id: 'lc-search-memory',
    connectionString: DATABASE_URL,
  }),
  options: {
    // Replay the recent turns of the thread; enough for follow-up context.
    lastMessages: 10,
    // Semantic recall needs a vector store + embedder; not needed for short
    // conversational follow-ups, so keep it off.
    semanticRecall: false,
  },
});
