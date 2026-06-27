import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Block } from '../components/passage/types';

// Server-side OIDC session store. The browser cookie holds only the opaque
// session id; the claims live here, so sessions survive restarts and multiple
// app instances.
export const oidcSession = pgTable('oidc_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  sub: text('sub').notNull(),
  claims: jsonb('claims').notNull().$type<Record<string, unknown>>(),
  // The provider's ID token from login, replayed as `id_token_hint` at logout so
  // the provider can confirm the end-session request is genuine (anti-CSRF on
  // its end-session endpoint). Server-side only; never sent to the browser.
  idToken: text('id_token'),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
});

// Per-user reading preferences, keyed by OIDC subject. Anonymous visitors keep
// the same shape in an `lb-prefs` cookie; signed-in users get this row so prefs
// follow them across devices. Null columns mean "no preference — use default".
export const userPreference = pgTable('user_preference', {
  sub: text('sub').primaryKey(),
  translation: text('translation'),
  redLetter: boolean('red_letter'),
  verseNumbers: boolean('verse_numbers'),
  textSize: integer('text_size'), // reading font size in px
  divineName: text('divine_name'), // 'lord' | 'yhwh' | 'yahweh'
  sourceOverlay: boolean('source_overlay'), // dotted-underline source-text hints
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull().defaultNow(),
});

// --- User library (signed-in only, keyed by OIDC subject) -------------------
// Highlights and notes are translation-agnostic: anchored to the canonical verse
// ref (e.g. 'JHN.3.16'), which is stable across BSB/MSB (both 'org'), so they
// follow the reader between translations. `book` is the USFM code.

export const userHighlight = pgTable(
  'user_highlight',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sub: text('sub').notNull(),
    book: text('book').notNull(),
    chapter: integer('chapter').notNull(),
    verse: integer('verse').notNull(),
    ref: text('ref').notNull(), // 'JHN.3.16'
    color: text('color').notNull(), // 'gold' | 'sage' | 'slate'
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    // One highlight per verse per user (re-highlighting changes the color).
    uniqueIndex('user_highlight_sub_ref_idx').on(t.sub, t.ref),
    index('user_highlight_sub_idx').on(t.sub, t.createdAt),
  ],
);

export const userNote = pgTable(
  'user_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sub: text('sub').notNull(),
    book: text('book').notNull(),
    chapter: integer('chapter').notNull(),
    verse: integer('verse').notNull(),
    ref: text('ref').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_note_sub_ref_idx').on(t.sub, t.ref), // one note per verse
    index('user_note_sub_idx').on(t.sub, t.updatedAt),
  ],
);

// Last-read position per chapter — powers "Continue reading" (latest) and
// "Recent" (last N distinct chapters). Upserted as the reader views a chapter.
export const readingProgress = pgTable(
  'reading_progress',
  {
    sub: text('sub').notNull(),
    book: text('book').notNull(), // USFM
    chapter: integer('chapter').notNull(),
    verse: integer('verse'), // last selected verse, if any
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sub, t.book, t.chapter] }),
    index('reading_progress_sub_idx').on(t.sub, t.updatedAt),
  ],
);

// In-flight authorization-code logins (PKCE verifier + nonce), keyed by the
// `state` we send to the provider and consume once on callback. Short-lived.
export const oidcLoginRequest = pgTable('oidc_login_request', {
  state: text('state').primaryKey(),
  verifier: text('verifier').notNull(),
  nonce: text('nonce').notNull(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
});

// --- Bible text ---------------------------------------------------------------
// One reading-ready document per book (matches how USX is distributed on DBL):
// the parsed chapters + verse index live in `content`, and we slice a chapter
// (or single verse) out of the JSONB by path at request time, so we never ship
// a whole book to render one chapter. Immutable seed data, keyed by translation.

export type BookChapter = {
  number: number;
  blocks: Block[]; // what <Passage> renders
  verses: Record<string, string>; // verse number -> plain text
};
export type BookContent = { chapters: Record<string, BookChapter> };

export const bibleTranslation = pgTable(
  'bible_translation',
  {
    id: text('id').primaryKey(), // e.g. 'BSB'
    name: text('name').notNull(),
    language: text('language').notNull().default('en'),
    // Text direction (for future RTL: Hebrew/Greek originals).
    direction: text('direction').notNull().default('ltr'),
    // Versification scheme this translation's refs are expressed in. 'org' is
    // the Scripture Burrito / DBL base scheme; Compare + cross-refs map against
    // it (BSB & MSB are both 'org'; MSB just carries extra Majority-Text verses).
    versification: text('versification').notNull().default('org'),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (t) => [
    // At most one translation may be the default.
    uniqueIndex('bible_translation_single_default_idx')
      .on(t.isDefault)
      .where(sql`${t.isDefault}`),
  ],
);

export const bibleBook = pgTable(
  'bible_book',
  {
    translationId: text('translation_id')
      .notNull()
      .references(() => bibleTranslation.id, { onDelete: 'cascade' }),
    usfm: text('usfm').notNull(), // e.g. 'PHP'
    slug: text('slug').notNull(), // e.g. 'philippians'
    name: text('name').notNull(),
    ordinal: integer('ordinal').notNull(), // 1..66
    chapterCount: integer('chapter_count').notNull(),
    content: jsonb('content').notNull().$type<BookContent>(),
  },
  (t) => [
    primaryKey({ columns: [t.translationId, t.usfm] }),
    uniqueIndex('bible_book_translation_slug_idx').on(t.translationId, t.slug),
  ],
);

// Normalized verse text — ref-addressed (Sefaria-style: a stable canonical ref,
// not a surrogate id) and globally ordered for range queries / verse-of-the-day
// / future full-text search. Complements the per-book reading cache above.
export const bibleVerse = pgTable(
  'bible_verse',
  {
    translationId: text('translation_id')
      .notNull()
      .references(() => bibleTranslation.id, { onDelete: 'cascade' }),
    book: text('book').notNull(), // USFM code, e.g. 'JHN'
    chapter: integer('chapter').notNull(),
    verse: integer('verse').notNull(),
    ref: text('ref').notNull(), // canonical, e.g. 'JHN.1.1'
    ordinal: integer('ordinal').notNull(), // 1..N within the translation
    text: text('text').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.translationId, t.book, t.chapter, t.verse] }),
    index('bible_verse_ordinal_idx').on(t.translationId, t.ordinal),
  ],
);

// Word tokens — one row per <char style="w"> (STEPBible-style addressing:
// book.chapter.verse.position). `strong` is the Strong's number; `lemma`/`morph`
// are reserved for a later STEPBible/OSHB morphology pass. The overlay flags
// carry the enhanced source-text annotations. Powers interlinear + word study +
// (eventually) morphology/proximity search.
export const bibleToken = pgTable(
  'bible_token',
  {
    translationId: text('translation_id')
      .notNull()
      .references(() => bibleTranslation.id, { onDelete: 'cascade' }),
    book: text('book').notNull(),
    chapter: integer('chapter').notNull(),
    verse: integer('verse').notNull(),
    position: integer('position').notNull(), // 0-based word index in the verse
    surface: text('surface').notNull(),
    strong: text('strong'),
    lemma: text('lemma'),
    morph: text('morph'),
    divineName: boolean('divine_name').notNull().default(false),
    otQuote: boolean('ot_quote').notNull().default(false),
    wordsOfJesus: boolean('words_of_jesus').notNull().default(false),
  },
  (t) => [
    primaryKey({
      columns: [t.translationId, t.book, t.chapter, t.verse, t.position],
    }),
    // Word study: all occurrences of a Strong's number.
    index('bible_token_strong_idx').on(t.translationId, t.strong),
  ],
);

// Original-language source words in ORIGINAL (Greek/Hebrew) order — the basis for
// a true morphological interlinear, as opposed to `bible_token` which is the
// English reading order. `position` is the 0-based index of the word within its
// verse in the *original* language's word order. Each row carries the inflected
// surface form, transliteration, dictionary lemma + gloss, the contextual English
// gloss, and the parsing/morphology code. Keyed by translation because the
// textual basis differs (BSB ≈ critical/NA, MSB ≈ Byzantine). Seeded from the
// STEPBible TAGNT (Greek) / TAHOT (Hebrew) data — CC BY 4.0, fetched not
// committed — whose English is itself BSB-based, so it aligns with our text.
export const bibleSourceToken = pgTable(
  'bible_source_token',
  {
    translationId: text('translation_id')
      .notNull()
      .references(() => bibleTranslation.id, { onDelete: 'cascade' }),
    book: text('book').notNull(), // USFM code, e.g. 'JHN'
    chapter: integer('chapter').notNull(),
    verse: integer('verse').notNull(),
    position: integer('position').notNull(), // 0-based, original-language order
    surface: text('surface').notNull(), // inflected original form, e.g. 'ἀγάπησεν'
    transliteration: text('transliteration'),
    strong: text('strong'), // normalized, e.g. 'G0025'
    lemma: text('lemma'), // dictionary form, e.g. 'ἀγαπάω'
    gloss: text('gloss'), // brief dictionary gloss, e.g. 'to love'
    english: text('english'), // contextual English for this word, e.g. 'loved'
    morph: text('morph'), // parsing code, e.g. 'V-AAI-3S'
    language: text('language').notNull(), // 'greek' | 'hebrew'
  },
  (t) => [
    primaryKey({
      columns: [t.translationId, t.book, t.chapter, t.verse, t.position],
    }),
    // Word study / concordance over the original-language lemma.
    index('bible_source_token_strong_idx').on(t.translationId, t.strong),
  ],
);

// Strong's lexicon (Greek + Hebrew) — translation-agnostic, keyed by the
// normalized Strong's number. Seeded from the public-domain Strong's 1890
// (OpenScriptures digitization). Powers the study panel / word study.
export const bibleLexeme = pgTable('bible_lexeme', {
  strong: text('strong').primaryKey(), // 'G2316' / 'H3068'
  language: text('language').notNull(), // 'greek' | 'hebrew'
  lemma: text('lemma').notNull(), // θεός / יְהֹוָה
  transliteration: text('transliteration'),
  pronunciation: text('pronunciation'),
  gloss: text('gloss'), // strongs_def (concise meaning)
  kjvDef: text('kjv_def'), // KJV usage
  derivation: text('derivation'),
});

// Cross-references as first-class links (Sefaria-style graph), so they're
// queryable in both directions and can drive the "cross-reference" search-result
// type. Sourced from <note style="x"> citations in the seed.
export const bibleCrossReference = pgTable(
  'bible_cross_reference',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    translationId: text('translation_id')
      .notNull()
      .references(() => bibleTranslation.id, { onDelete: 'cascade' }),
    fromBook: text('from_book').notNull(),
    fromChapter: integer('from_chapter').notNull(),
    fromVerse: integer('from_verse').notNull(),
    toBook: text('to_book').notNull(), // canon slug
    toChapter: integer('to_chapter').notNull(),
    toVerse: integer('to_verse'),
    toVerseEnd: integer('to_verse_end'),
    kind: text('kind').notNull().default('reference'),
  },
  (t) => [
    index('bible_xref_from_idx').on(
      t.translationId,
      t.fromBook,
      t.fromChapter,
      t.fromVerse,
    ),
    index('bible_xref_to_idx').on(t.translationId, t.toBook, t.toChapter),
  ],
);

// --- Verse-keyed commentaries (public-domain works) -------------------------
// A `bible_commentary_work` is one author/edition (Calvin, Matthew Henry, …);
// `bible_commentary` holds its per-verse entries. Like highlights/notes, these
// are translation-agnostic: anchored to the canonical (book, chapter, verse) —
// USFM `book`, KJV versification from the SWORD source — so the same comment
// shows under BSB/MSB/KJV. Sourced from CrossWire SWORD modules and extracted to
// committed artifacts (seed/commentaries/*.json) by scripts/sword/.
export const bibleCommentaryWork = pgTable('bible_commentary_work', {
  id: text('id').primaryKey(), // stable work id, e.g. 'calvin', 'mhc'
  name: text('name').notNull(),
  author: text('author').notNull(),
  year: text('year'), // display string, e.g. '1540–1564'
  tradition: text('tradition'), // 'Reformed' | 'Puritan' | 'Methodist' | …
  license: text('license').notNull(),
  sourceModule: text('source_module').notNull(), // SWORD module name
  sourceUrl: text('source_url'),
  ordinal: integer('ordinal').notNull().default(0), // display order
});

export const bibleCommentary = pgTable(
  'bible_commentary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: text('work_id')
      .notNull()
      .references(() => bibleCommentaryWork.id, { onDelete: 'cascade' }),
    book: text('book').notNull(), // USFM code
    chapter: integer('chapter').notNull(),
    verse: integer('verse').notNull(),
    verseEnd: integer('verse_end'), // for passage-level entries (same chapter)
    body: text('body').notNull(), // plain text, blank-line paragraph breaks
  },
  (t) => [
    index('bible_commentary_ref_idx').on(t.book, t.chapter, t.verse),
    index('bible_commentary_work_ref_idx').on(
      t.workId,
      t.book,
      t.chapter,
      t.verse,
    ),
  ],
);
