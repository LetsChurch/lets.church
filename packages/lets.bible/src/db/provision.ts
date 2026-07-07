// Structural provisioning for a lets.bible deployment: run DB migrations and push
// the OpenSearch index mappings + hybrid search pipeline. Runs on every pod start
// (the deployment's init container). A Postgres advisory lock serializes it across
// replicas so concurrent starts don't race the migration or the index create.
//
// It deliberately does NOT seed the corpus or build the verse index, and nothing
// here (or in indexing) ever calls OpenAI. Seeding and indexing are manual,
// out-of-band steps:
//   - local:  `just lb-up` (seed + `lb-index`, which reads the committed vectors)
//   - remote: `just lb-index-remote <host>` to (re)build an index from the
//             committed embeddings; seed the target DB out-of-band.
import { execFileSync } from 'node:child_process';

import { z } from 'zod';

import { createPool } from './pool';

const { LETS_BIBLE_DATABASE_URL } = z
  .object({ LETS_BIBLE_DATABASE_URL: z.string() })
  .parse(process.env);

// Stable key so all replicas contend on the same advisory lock.
const LOCK_KEY = 728_401_553;

function run(script: string): void {
  console.log(`[provision] pnpm run ${script}`);
  execFileSync('pnpm', ['--filter', '@letschurch/lets.bible', 'run', script], {
    stdio: 'inherit',
    env: process.env,
  });
}

const pool = createPool(LETS_BIBLE_DATABASE_URL);
try {
  await pool.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
  try {
    // Both idempotent: Drizzle tracks applied migrations, and push-mappings is
    // create-if-missing + additive. The lock keeps replicas from racing them.
    run('db:migrate');
    run('es:push-mappings');
    console.log(
      '[provision] done (migrations + mappings). Seeding + indexing are manual.',
    );
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
  }
} finally {
  await pool.end();
}
