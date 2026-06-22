// Seeds the Strong's lexicon (bible_lexeme) from the public-domain Strong's 1890
// dictionaries (OpenScriptures CC-BY-SA digitization) in seed/lexicon/*.js.
// Translation-agnostic — run once. `just lexicon-seed` (or on the host).

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bibleLexeme, db } from '.';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '..', 'seed', 'lexicon');

type RawEntry = {
  lemma?: string;
  translit?: string;
  xlit?: string;
  pron?: string;
  strongs_def?: string;
  kjv_def?: string;
  derivation?: string;
};

async function main() {
  await db.delete(bibleLexeme);

  const sources: Array<[string, 'greek' | 'hebrew']> = [
    ['strongs-greek.js', 'greek'],
    ['strongs-hebrew.js', 'hebrew'],
  ];

  let total = 0;
  for (const [file, language] of sources) {
    const dict = require(join(dir, file)) as Record<string, RawEntry>;
    const rows = Object.entries(dict).map(([strong, e]) => ({
      strong,
      language,
      lemma: e.lemma ?? '',
      transliteration: e.translit ?? e.xlit ?? null,
      pronunciation: e.pron ?? null,
      gloss: e.strongs_def?.trim() || null,
      kjvDef: e.kjv_def?.trim() || null,
      derivation: e.derivation?.trim() || null,
    }));
    for (let i = 0; i < rows.length; i += 1000) {
      await db.insert(bibleLexeme).values(rows.slice(i, i + 1000));
    }
    total += rows.length;
    console.log(`${language.padEnd(7)} ${rows.length} entries`);
  }
  console.log(`\nSeeded ${total} lexemes.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
