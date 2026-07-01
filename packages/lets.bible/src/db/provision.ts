// Idempotent provisioning for a lets.bible deployment: migrate → seed the corpus
// if not yet seeded → build the OpenSearch verse index if not yet built. Designed
// to run on every pod start (the deployment's init container):
//
//   - Safe across replicas: a Postgres advisory lock serializes provisioning, so
//     only one pod does the slow work; the others block, then see it's done.
//   - Cheap once provisioned: a marker row (`lets_bible_provisioning`) records
//     completion, so the seed/index steps are skipped on subsequent starts.
//   - Re-seedable: the seed scripts are themselves idempotent (they clear-then-
//     insert per translation), so a re-run can't duplicate data. Set
//     LETS_BIBLE_FORCE_RESEED=true to force a full re-seed + re-index.
//
// The OpenSearch index is additionally guarded by a live doc-count check, so if
// the cluster is wiped (but the DB marker persists) the index is rebuilt anyway.
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { createPool } from './pool';

const { LETS_BIBLE_DATABASE_URL, OPENSEARCH_URL } = z
  .object({
    LETS_BIBLE_DATABASE_URL: z.string(),
    OPENSEARCH_URL: z.string().default('http://opensearch:9200'),
  })
  .parse(process.env);

const FORCE = process.env.LETS_BIBLE_FORCE_RESEED === 'true';
// Stable key so all replicas contend on the same advisory lock.
const LOCK_KEY = 728_401_553;
// Must match search/client.ts VERSE_INDEX.
const VERSE_INDEX = 'lets_bible_verses_v2';
// Order matters: bible text first, then dependent data. seed:source defaults to
// John only (dev convenience); in prod we seed the WHOLE Bible so the
// original-language interlinear ("Original" mode) covers every book. Seed BSB
// with the whole Bible (NT critical Greek + the shared Masoretic OT Hebrew),
// then each other translation's NT under its OWN Greek basis so every
// translation's interlinear matches its own text: KJV → Textus Receptus (incl.
// TR-only readings like the Comma Johanneum, which the critical text omits),
// MSB/WEB → Byzantine/Majority. The OT falls back to BSB's Hebrew for all — it's
// the same Masoretic base — so it's seeded once.
const SEEDS: ReadonlyArray<{ script: string; env?: Record<string, string> }> = [
  { script: 'seed:bible' },
  { script: 'seed:kjv' },
  { script: 'seed:lexicon' },
  { script: 'seed:crossrefs' },
  { script: 'seed:commentaries' },
  { script: 'seed:source', env: { BOOKS: 'ALL', TRANSLATION_ID: 'BSB' } },
  { script: 'seed:source', env: { BOOKS: 'NT', TRANSLATION_ID: 'KJV' } },
  { script: 'seed:source', env: { BOOKS: 'NT', TRANSLATION_ID: 'MSB' } },
  { script: 'seed:source', env: { BOOKS: 'NT', TRANSLATION_ID: 'WEB' } },
];

function run(script: string, env?: Record<string, string>): void {
  const suffix = env
    ? ` (${Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')})`
    : '';
  console.log(`[provision] pnpm run ${script}${suffix}`);
  execFileSync('pnpm', ['--filter', '@letschurch/lets.bible', 'run', script], {
    stdio: 'inherit',
    env: env ? { ...process.env, ...env } : process.env,
  });
}

async function indexedVerseCount(): Promise<number> {
  try {
    const res = await fetch(`${OPENSEARCH_URL}/${VERSE_INDEX}/_count`);
    if (!res.ok) return 0;
    const body = (await res.json()) as { count?: number };
    return body.count ?? 0;
  } catch {
    return 0;
  }
}

const pool = createPool(LETS_BIBLE_DATABASE_URL);
try {
  await pool.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
  try {
    // Migrations are idempotent (Drizzle tracks applied ones); always run.
    run('db:migrate');

    await pool.query(
      `CREATE TABLE IF NOT EXISTS lets_bible_provisioning (
         id integer PRIMARY KEY,
         seeded_at timestamptz,
         indexed_at timestamptz
       )`,
    );
    const marker = (
      await pool.query(
        'SELECT seeded_at, indexed_at FROM lets_bible_provisioning WHERE id = 1',
      )
    ).rows[0] as
      | { seeded_at: Date | null; indexed_at: Date | null }
      | undefined;

    if (FORCE || !marker?.seeded_at) {
      console.log(
        FORCE ? '[provision] FORCE re-seed…' : '[provision] seeding…',
      );
      for (const s of SEEDS) run(s.script, s.env);
      await pool.query(
        `INSERT INTO lets_bible_provisioning (id, seeded_at) VALUES (1, now())
           ON CONFLICT (id) DO UPDATE SET seeded_at = now()`,
      );
    } else {
      console.log(
        `[provision] already seeded (${marker.seeded_at.toISOString()}) — skipping`,
      );
    }

    const indexed =
      !FORCE && !!marker?.indexed_at && (await indexedVerseCount()) > 0;
    if (!indexed) {
      console.log('[provision] building verse index…');
      run('es:push-mappings');
      run('es:index-verses');
      await pool.query(
        `INSERT INTO lets_bible_provisioning (id, indexed_at) VALUES (1, now())
           ON CONFLICT (id) DO UPDATE SET indexed_at = now()`,
      );
    } else {
      console.log('[provision] verse index present — skipping');
    }
    console.log('[provision] done.');
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
  }
} finally {
  await pool.end();
}
