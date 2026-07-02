// USFM code → OSIS book id. lets.bible's canon (src/lib/canon.ts) keys books by
// USFM code (e.g. "JHN", "PHP", "PSA"), but lets.church's media index tags
// verses with OSIS book ids (e.g. "John", "Phil", "Ps") in `Book.Chapter.Verse`
// tokens. To ask web's media-for-verse endpoint for a verse, we translate the
// reader's book to OSIS here.
//
// The 66-book Protestant canon, in canonical order — the OSIS ids match the
// `BOOKS` table in packages/web/src/util/bible-url.ts (the same ids the
// annotate-transcript LLM emits and the `bibleRefs` facet indexes).
const USFM_TO_OSIS: Record<string, string> = {
  GEN: 'Gen',
  EXO: 'Exod',
  LEV: 'Lev',
  NUM: 'Num',
  DEU: 'Deut',
  JOS: 'Josh',
  JDG: 'Judg',
  RUT: 'Ruth',
  '1SA': '1Sam',
  '2SA': '2Sam',
  '1KI': '1Kgs',
  '2KI': '2Kgs',
  '1CH': '1Chr',
  '2CH': '2Chr',
  EZR: 'Ezra',
  NEH: 'Neh',
  EST: 'Esth',
  JOB: 'Job',
  PSA: 'Ps',
  PRO: 'Prov',
  ECC: 'Eccl',
  SNG: 'Song',
  ISA: 'Isa',
  JER: 'Jer',
  LAM: 'Lam',
  EZK: 'Ezek',
  DAN: 'Dan',
  HOS: 'Hos',
  JOL: 'Joel',
  AMO: 'Amos',
  OBA: 'Obad',
  JON: 'Jonah',
  MIC: 'Mic',
  NAM: 'Nah',
  HAB: 'Hab',
  ZEP: 'Zeph',
  HAG: 'Hag',
  ZEC: 'Zech',
  MAL: 'Mal',
  MAT: 'Matt',
  MRK: 'Mark',
  LUK: 'Luke',
  JHN: 'John',
  ACT: 'Acts',
  ROM: 'Rom',
  '1CO': '1Cor',
  '2CO': '2Cor',
  GAL: 'Gal',
  EPH: 'Eph',
  PHP: 'Phil',
  COL: 'Col',
  '1TH': '1Thess',
  '2TH': '2Thess',
  '1TI': '1Tim',
  '2TI': '2Tim',
  TIT: 'Titus',
  PHM: 'Phlm',
  HEB: 'Heb',
  JAS: 'Jas',
  '1PE': '1Pet',
  '2PE': '2Pet',
  '1JN': '1John',
  '2JN': '2John',
  '3JN': '3John',
  JUD: 'Jude',
  REV: 'Rev',
};

// OSIS book id for a USFM code, or null for an unknown code.
export function osisBookId(usfmCode: string): string | null {
  return USFM_TO_OSIS[usfmCode] ?? null;
}
