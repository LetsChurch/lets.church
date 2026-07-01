// Narrow backfill: (re)populate `bible_cross_reference` for every translation from
// the committed artifact (seed/overlays/cross-references.json) without a full
// re-seed. The source-text-overlay strip left the seed USX overlay-pure (no
// `<note style="x">`), so the cross-references — which power the OT-quotation
// hover-card source links and the study panel's cross-references — now live in that
// artifact. BSB/MSB use their own set; the KJV (no markup of its own) projects MSB's.
// Idempotent: replaces each translation's rows.
//
// Run in the letsbible container: `just lb-seed-crossrefs`

import { eq } from 'drizzle-orm';
import { loadCrossRefs } from '../server/overlays';
import { bibleCrossReference, db } from '.';

// translation id → which translation's cross-reference set it uses.
const TRANSLATIONS: [id: string, reference: string][] = [
  ['BSB', 'BSB'],
  ['MSB', 'MSB'],
  ['KJV', 'MSB'],
  ['WEB', 'MSB'],
];

async function main() {
  for (const [id, reference] of TRANSLATIONS) {
    const rows = loadCrossRefs(reference).map((x) => ({
      translationId: id,
      fromBook: x.fromBook,
      fromChapter: x.fromChapter,
      fromVerse: x.fromVerse,
      toBook: x.toBook,
      toChapter: x.toChapter,
      toVerse: x.toVerse ?? null,
    }));
    await db
      .delete(bibleCrossReference)
      .where(eq(bibleCrossReference.translationId, id));
    for (let i = 0; i < rows.length; i += 2000) {
      await db.insert(bibleCrossReference).values(rows.slice(i, i + 2000));
    }
    console.log(`${id}: ${rows.length} cross-references (from ${reference})`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
