// Seeds the verse-keyed public-domain commentaries from the committed artifacts
// (seed/commentaries/*.json) into bible_commentary_work + bible_commentary. The
// artifacts are extracted from CrossWire SWORD modules on the host by
// scripts/sword/extract-commentaries.ts; this script is the in-container half
// that loads them — analogous to seed-cross-references.ts.
//
// Idempotent: upserts each work and replaces its entries. Commentaries are
// translation-agnostic (anchored to the canonical book/chapter/verse, KJV
// versification), so no per-translation duplication.
//
// Run in the letsbible container: `just lb-seed-commentaries`

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { bibleCommentary, bibleCommentaryWork, db } from '.';

const here = dirname(fileURLToPath(import.meta.url));
const COMMENTARIES_DIR = join(here, '..', '..', 'seed', 'commentaries');

type Artifact = {
  work: typeof bibleCommentaryWork.$inferInsert;
  entries: Array<{
    book: string;
    chapter: number;
    verse: number;
    verseEnd?: number;
    body: string;
  }>;
};

async function main() {
  const files = readdirSync(COMMENTARIES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length === 0) {
    throw new Error(
      `No commentary artifacts in ${COMMENTARIES_DIR}. Run \`pnpm exec tsx scripts/sword/extract-commentaries.ts\` on the host first.`,
    );
  }

  for (const file of files) {
    const { work, entries } = JSON.parse(
      readFileSync(join(COMMENTARIES_DIR, file), 'utf8'),
    ) as Artifact;

    await db
      .insert(bibleCommentaryWork)
      .values(work)
      .onConflictDoUpdate({ target: bibleCommentaryWork.id, set: work });

    await db.delete(bibleCommentary).where(eq(bibleCommentary.workId, work.id));

    const rows = entries.map((e) => ({
      workId: work.id,
      book: e.book,
      chapter: e.chapter,
      verse: e.verse,
      verseEnd: e.verseEnd ?? null,
      body: e.body,
    }));
    for (let i = 0; i < rows.length; i += 1000) {
      await db.insert(bibleCommentary).values(rows.slice(i, i + 1000));
    }
    console.log(`${work.id}: ${rows.length} entries (${work.name})`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
