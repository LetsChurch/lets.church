// Create (if missing) and update the lets.bible search index mappings. Mirrors
// the DB-migration step but for Elasticsearch. Run via `just lets-bible-es-push`
// (or `pnpm run es:push-mappings`).

import { client, VERSE_INDEX, waitForElasticsearch } from './client';
import { verseProperties, verseSettings } from './mappings';

await waitForElasticsearch();

const exists = await client.indices.exists({ index: VERSE_INDEX });
if (!exists) {
  console.log(`Creating index ${VERSE_INDEX}`);
  await client.indices.create({ index: VERSE_INDEX, settings: verseSettings });
}

await client.indices.putMapping({
  index: VERSE_INDEX,
  properties: verseProperties,
});

console.log(`Pushed mappings for ${VERSE_INDEX}.`);
process.exit(0);
