import { Client, HttpConnection } from '@elastic/elasticsearch';
import { z } from 'zod';

// lets.bible runs its search on the SAME Elasticsearch cluster as the rest of
// the stack, but — exactly like its Postgres database — it owns its own indices
// and mappings. Everything here is namespaced under `lets_bible_*` so it never
// collides with the web app's `lc_*` indices, and lets.bible never imports the
// `@letschurch/elasticsearch` package (that's the web app's index management).
const { ELASTICSEARCH_URL } = z
  .object({ ELASTICSEARCH_URL: z.string() })
  .parse(process.env);

// Bumped (v1 → v2 …) whenever the mapping changes incompatibly; reindex into the
// new name, then flip the alias/constant.
export const VERSE_INDEX = 'lets_bible_verses_v1';

export const client = new Client({
  node: ELASTICSEARCH_URL,
  Connection: HttpConnection,
});

// Block until the cluster answers a ping (the index/push scripts run right after
// `docker compose up`, when ES may still be starting).
export async function waitForElasticsearch(
  retries = 60,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      if (await client.ping()) {
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Elasticsearch not reachable');
}
