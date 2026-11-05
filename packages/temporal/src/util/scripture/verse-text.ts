// Public-domain verse text (data/verse-text.tsv.gz: one line per verse, OSIS
// ref then KJV, WEB and BSB, exported from lets.bible by
// `just lb-export-verse-text`). Quote matching indexes every translation;
// study guides print passages from the BSB.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { verseCount, type BibleRef } from './versification';

export const TRANSLATIONS = ['KJV', 'WEB', 'BSB'] as const;
export type Translation = (typeof TRANSLATIONS)[number];

/**
 * The whole file, decompressed. Not cached: callers build what they need from
 * it (the quote index, one translation's map) and let the multi-megabyte string go.
 * Throws when the bundle didn't ship it.
 */
export function readVerseTextTsv(): string {
  return gunzipSync(
    readFileSync(new URL('./data/verse-text.tsv.gz', import.meta.url)),
  ).toString('utf8');
}

const byTranslation = new Map<Translation, Map<string, string>>();
function verses(translation: Translation): Map<string, string> {
  let map = byTranslation.get(translation);
  if (map) return map;
  const column = TRANSLATIONS.indexOf(translation) + 1;
  map = new Map();
  for (const line of readVerseTextTsv().split('\n')) {
    const fields = line.split('\t');
    const osis = fields[0];
    const text = fields[column];
    if (osis && text) map.set(osis, text);
  }
  byTranslation.set(translation, map);
  return map;
}

export type PassageVerse = { chapter: number; verse: number; text: string };

/**
 * The text of a verse or verse range, one entry per verse, cut to its first
 * `maxVerses`, skipping verses the translation omits. Null for a chapter- or
 * book-level reference, or when the translation has none of its verses.
 */
export function passageText(
  ref: BibleRef,
  options: { translation?: Translation; maxVerses?: number } = {},
): PassageVerse[] | null {
  const { translation = 'BSB', maxVerses = 12 } = options;
  if (ref.chapter === undefined || ref.verse === undefined) return null;
  const endChapter = ref.endChapter ?? ref.chapter;
  const endVerse =
    ref.endVerse ?? (ref.endChapter === undefined ? ref.verse : undefined);
  if (endVerse === undefined) return null;

  const text = verses(translation);
  const out: PassageVerse[] = [];
  for (let chapter = ref.chapter; chapter <= endChapter; chapter += 1) {
    const first = chapter === ref.chapter ? ref.verse : 1;
    const last =
      chapter === endChapter ? endVerse : verseCount(ref.book, chapter);
    for (let verse = first; verse <= last; verse += 1) {
      if (out.length >= maxVerses) return out;
      // Verses a translation omits (the BSB leaves out later additions such
      // as Matthew 18:11) are skipped, as that translation prints them.
      const line = text.get(`${ref.book}.${chapter}.${verse}`);
      if (line) out.push({ chapter, verse, text: line });
    }
  }
  return out.length > 0 ? out : null;
}
