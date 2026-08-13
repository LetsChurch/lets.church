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
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { createPool } from './pool';

// Stable key so all replicas contend on the same advisory lock.
const LOCK_KEY = 728_401_553;

function run(script: string): void {
  console.log(`[provision] pnpm run ${script}`);
  execFileSync('pnpm', ['--filter', '@letschurch/lets.bible', 'run', script], {
    stdio: 'inherit',
    env: process.env,
  });
}

type ProvisionClient = {
  query(statement: string, values: [number]): Promise<unknown>;
  release(): void;
};

type ProvisionPool = {
  connect(): Promise<ProvisionClient>;
  end(): Promise<void>;
};

export async function provision(
  pool: ProvisionPool,
  runScript: (script: string) => void,
): Promise<void> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
      try {
        // Both idempotent: Drizzle tracks applied migrations, and push-mappings is
        // create-if-missing + additive. The lock keeps replicas from racing them.
        runScript('db:migrate');
        runScript('es:push-mappings');
        console.log(
          '[provision] done (migrations + mappings). Seeding + indexing are manual.',
        );
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const { LETS_BIBLE_DATABASE_URL } = z
    .object({ LETS_BIBLE_DATABASE_URL: z.string() })
    .parse(process.env);
  await provision(createPool(LETS_BIBLE_DATABASE_URL), run);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).toString()
) {
  await main();
}
