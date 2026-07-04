import { and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  type BookChapter,
  bibleBook,
  bibleCommentary,
  bibleCommentaryWork,
  bibleCrossReference,
  bibleLexeme,
  bibleSourceToken,
  bibleToken,
  bibleTranslation,
  bibleVerse,
  db,
} from '@/db';
import { bookBySlug } from '@/lib/canon';
import { osisBookId } from '@/lib/osis';
import { parseReference } from '@/lib/reference';
import { hybridSearchVerses, relatedVerses } from '@/search/search';
import {
  applyOverlaysToTokens,
  loadOverlayIndex,
} from '@/server/overlays/apply-tokens';
import { defaultTranslationId, resolveTranslation } from '@/server/translation';
import { publicProcedure } from '../trpc';

// Tables address books by USFM code; the reader uses slugs. Resolve either.
function usfmOf(book: string): string {
  return bookBySlug(book)?.code ?? book.toUpperCase();
}

// web's media-for-verse endpoint (server-to-server, unauthenticated — it only
// returns public, already-approved media). WEB_INTERNAL_URL is the back-channel
// origin (dev http://web:3000, prod the in-cluster http://web); it falls back to
// the OIDC back-channel URL, which is the same host. When unset the procedure
// degrades to "no media" rather than erroring.
const WEB_INTERNAL_URL = (
  process.env.WEB_INTERNAL_URL ??
  process.env.OIDC_INTERNAL_URL ??
  ''
).replace(/\/+$/, '');

// Shape returned by web's /api/internal/media-for-verse. Parsed defensively so a
// change on the web side degrades to "no media" instead of throwing.
const mediaForVerseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      channelName: z.string().nullable(),
      channelSlug: z.string().nullable(),
      thumbnailUrl: z.string().nullable(),
      lengthSeconds: z.number().nullable(),
      publishedAt: z.string(),
      viewCount: z.number(),
      seconds: z.number().nullable(),
      url: z.string(),
    }),
  ),
  searchUrl: z.string().nullable(),
});

export type RelatedMedia = z.infer<typeof mediaForVerseSchema>;

// Outgoing cross-references for a verse, with the target verse text, deduped and
// resolved to display labels + reader links. `toBook` is stored as a canon slug.
async function fetchCrossReferences(
  translationId: string,
  fromBook: string, // USFM
  fromChapter: number,
  fromVerse: number,
) {
  const rows = await db
    .select({
      toBook: bibleCrossReference.toBook,
      toChapter: bibleCrossReference.toChapter,
      toVerse: bibleCrossReference.toVerse,
      toVerseEnd: bibleCrossReference.toVerseEnd,
    })
    .from(bibleCrossReference)
    .where(
      and(
        eq(bibleCrossReference.translationId, translationId),
        eq(bibleCrossReference.fromBook, fromBook),
        eq(bibleCrossReference.fromChapter, fromChapter),
        eq(bibleCrossReference.fromVerse, fromVerse),
      ),
    )
    .limit(12);

  const refs = rows
    .filter((r) => r.toVerse != null)
    .map((r) => `${usfmOf(r.toBook)}.${r.toChapter}.${r.toVerse}`);
  const texts = new Map<string, string>();
  if (refs.length) {
    const vrows = await db
      .select({ ref: bibleVerse.ref, text: bibleVerse.text })
      .from(bibleVerse)
      .where(
        and(
          eq(bibleVerse.translationId, translationId),
          inArray(bibleVerse.ref, refs),
        ),
      );
    for (const v of vrows) {
      texts.set(v.ref, v.text);
    }
  }

  const seen = new Set<string>();
  const out: Array<{
    label: string;
    slug: string;
    chapter: number;
    verse: number | null;
    text: string | null;
  }> = [];
  for (const r of rows) {
    const book = bookBySlug(r.toBook);
    const name = book?.name ?? r.toBook;
    const range =
      r.toVerse != null
        ? `:${r.toVerse}${r.toVerseEnd ? `-${r.toVerseEnd}` : ''}`
        : '';
    const label = `${name} ${r.toChapter}${range}`;
    if (seen.has(label)) {
      continue;
    }
    seen.add(label);
    const ref =
      r.toVerse != null
        ? `${usfmOf(r.toBook)}.${r.toChapter}.${r.toVerse}`
        : null;
    out.push({
      label,
      slug: book?.slug ?? r.toBook,
      chapter: r.toChapter,
      verse: r.toVerse,
      text: ref ? (texts.get(ref) ?? null) : null,
    });
  }
  return out;
}

export const bibleProcedures = {
  // Available translations (default first) for the reader's translation picker.
  translations: publicProcedure.query(async () => {
    const [rows, tokenized, sourced] = await Promise.all([
      db
        .select({
          id: bibleTranslation.id,
          name: bibleTranslation.name,
          isDefault: bibleTranslation.isDefault,
          attribution: bibleTranslation.attribution,
          attributionUrl: bibleTranslation.attributionUrl,
        })
        .from(bibleTranslation)
        .orderBy(desc(bibleTranslation.isDefault), bibleTranslation.id),
      // English word tokens (with Strong's) → the reading-order "English (reverse)"
      // interlinear and per-word study.
      db
        .selectDistinct({ translationId: bibleToken.translationId })
        .from(bibleToken),
      // Original-language source tokens → the "Original" (Greek/Hebrew) interlinear.
      // A translation without its own English tokens (e.g. WEB) still gets the
      // interlinear affordance from these.
      db
        .selectDistinct({ translationId: bibleSourceToken.translationId })
        .from(bibleSourceToken),
    ]);
    const english = new Set(tokenized.map((t) => t.translationId));
    const source = new Set(sourced.map((t) => t.translationId));
    return rows.map((r) => ({
      ...r,
      hasInterlinear: english.has(r.id) || source.has(r.id),
      // Only translations with their own Strong's-tagged English tokens can show
      // the reverse (reading-order) interlinear + English word study.
      hasEnglishInterlinear: english.has(r.id),
    }));
  }),

  // Unified search: detects a scripture reference ("John 3:16", "rom 8") for a
  // direct jump, and full-text searches verse text within the current
  // translation. Returns both so the UI can show a "go to reference" card above
  // the text hits.
  search: publicProcedure
    .input(
      z.object({
        q: z.string(),
        translation: z.string().optional(),
        limit: z.number().int().positive().max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const translationId = await resolveTranslation(ctx, input.translation);
      const q = input.q.trim();
      if (!q) {
        return {
          reference: null,
          verses: [],
          related: [],
          crossReferences: [],
          translation: translationId,
        };
      }

      const parsed = parseReference(q);
      const reference = parsed
        ? {
            ...parsed,
            label: `${bookBySlug(parsed.book)?.name ?? parsed.book} ${
              parsed.chapter
            }${parsed.verse != null ? `:${parsed.verse}` : ''}`,
          }
        : null;

      const verses = await hybridSearchVerses({
        q,
        translationId,
        size: input.limit,
      });

      // For a verse reference, find passages like that verse's text and pull its
      // cross-references; otherwise find passages like the raw query.
      let likeText = q;
      let sourceRef: string | null = null;
      if (reference?.verse != null) {
        sourceRef = `${usfmOf(reference.book)}.${reference.chapter}.${reference.verse}`;
        const [row] = await db
          .select({ text: bibleVerse.text })
          .from(bibleVerse)
          .where(
            and(
              eq(bibleVerse.translationId, translationId),
              eq(bibleVerse.ref, sourceRef),
            ),
          )
          .limit(1);
        if (row?.text) {
          likeText = row.text;
        }
      }

      const excludeRefs = verses.map((v) => v.ref);
      if (sourceRef) {
        excludeRefs.push(sourceRef);
      }

      const [related, crossReferences] = await Promise.all([
        relatedVerses({ like: likeText, translationId, excludeRefs, size: 6 }),
        reference?.verse != null
          ? fetchCrossReferences(
              translationId,
              usfmOf(reference.book),
              reference.chapter,
              reference.verse,
            )
          : Promise.resolve([]),
      ]);

      return {
        reference,
        verses,
        related,
        crossReferences,
        translation: translationId,
      };
    }),

  // Returns one chapter's reading blocks + verse text, sliced out of the book's
  // JSONB by path so we never transfer a whole book to render one chapter.
  chapter: publicProcedure
    .input(
      z.object({
        translation: z.string().optional(),
        book: z.string(),
        chapter: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }): Promise<BookChapter | null> => {
      const translationId = await resolveTranslation(ctx, input.translation);
      const rows = await db
        .select({
          chapter: sql<BookChapter | null>`${bibleBook.content} -> 'chapters' -> ${String(input.chapter)}`,
        })
        .from(bibleBook)
        .where(
          and(
            eq(bibleBook.translationId, translationId),
            eq(bibleBook.slug, input.book),
          ),
        )
        .limit(1);
      return rows[0]?.chapter ?? null;
    }),

  // The whole book's chapters in one call (resolved translation). Used by the
  // offline "download translation" feature so a full download is ~66 requests
  // instead of one per chapter.
  book: publicProcedure
    .input(z.object({ translation: z.string().optional(), book: z.string() }))
    .query(
      async ({
        ctx,
        input,
      }): Promise<{
        translation: string;
        chapters: Record<string, BookChapter>;
      } | null> => {
        const translationId = await resolveTranslation(ctx, input.translation);
        const rows = await db
          .select({
            chapters: sql<
              Record<string, BookChapter>
            >`${bibleBook.content} -> 'chapters'`,
          })
          .from(bibleBook)
          .where(
            and(
              eq(bibleBook.translationId, translationId),
              eq(bibleBook.slug, input.book),
            ),
          )
          .limit(1);
        const chapters = rows[0]?.chapters;
        return chapters ? { translation: translationId, chapters } : null;
      },
    ),

  // A chapter's verses aligned across translations for side-by-side compare.
  // BSB & MSB share the 'org' versification, so we align by verse number; the
  // row set is the union of verse numbers (MSB carries a few extra), with null
  // where a translation lacks that verse.
  compareChapter: publicProcedure
    .input(
      z.object({
        book: z.string(),
        chapter: z.number().int().positive(),
        translations: z.array(z.string()).min(1).max(4),
      }),
    )
    .query(async ({ input }) => {
      const usfm = usfmOf(input.book);
      // Resolve the requested translations (preserve order, keep only real ones).
      const known = await db
        .select({ id: bibleTranslation.id, name: bibleTranslation.name })
        .from(bibleTranslation);
      const byId = new Map(known.map((t) => [t.id, t]));
      const translations = input.translations
        .filter((id) => byId.has(id))
        .map((id) => ({ id, name: byId.get(id)?.name ?? id }));
      if (translations.length === 0) {
        return { translations: [], verses: [] };
      }

      const rows = await db
        .select({
          translationId: bibleVerse.translationId,
          verse: bibleVerse.verse,
          text: bibleVerse.text,
        })
        .from(bibleVerse)
        .where(
          and(
            inArray(
              bibleVerse.translationId,
              translations.map((t) => t.id),
            ),
            eq(bibleVerse.book, usfm),
            eq(bibleVerse.chapter, input.chapter),
          ),
        )
        .orderBy(asc(bibleVerse.verse));

      // verse number -> { translationId -> text }
      const byVerse = new Map<number, Record<string, string>>();
      for (const r of rows) {
        const entry = byVerse.get(r.verse) ?? {};
        entry[r.translationId] = r.text;
        byVerse.set(r.verse, entry);
      }
      const verses = [...byVerse.keys()]
        .sort((a, b) => a - b)
        .map((verse) => ({
          verse,
          texts: translations.map((t) => byVerse.get(verse)?.[t.id] ?? null),
        }));

      return { translations, verses };
    }),

  // Word tokens for a chapter (Strong's + overlay) — the interlinear layer.
  tokens: publicProcedure
    .input(
      z.object({
        translation: z.string().optional(),
        book: z.string(),
        chapter: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const translationId = await resolveTranslation(ctx, input.translation);
      const [rows, index] = await Promise.all([
        db
          .select({
            verse: bibleToken.verse,
            position: bibleToken.position,
            surface: bibleToken.surface,
            strong: bibleToken.strong,
            lemma: bibleToken.lemma,
            morph: bibleToken.morph,
            divineName: bibleToken.divineName,
            otQuote: bibleToken.otQuote,
            wordsOfJesus: bibleToken.wordsOfJesus,
          })
          .from(bibleToken)
          .where(
            and(
              eq(bibleToken.translationId, translationId),
              eq(bibleToken.book, usfmOf(input.book)),
              eq(bibleToken.chapter, input.chapter),
            ),
          )
          .orderBy(asc(bibleToken.verse), asc(bibleToken.position)),
        loadOverlayIndex(),
      ]);
      // bible_token is overlay-pure; resolve divine name / OT quotation from the
      // render-time index so the study panel gets them here too.
      return applyOverlaysToTokens(
        usfmOf(input.book),
        input.chapter,
        rows,
        index,
      );
    }),

  // Interlinear view: every word of a chapter (in reading order) joined to its
  // lexicon entry, so each English word can be stacked with its original-language
  // lemma, transliteration, and a short gloss. Grouped by verse on the client.
  interlinear: publicProcedure
    .input(
      z.object({
        translation: z.string().optional(),
        book: z.string(),
        chapter: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const translationId = await resolveTranslation(ctx, input.translation);
      const [rows, index] = await Promise.all([
        db
          .select({
            verse: bibleToken.verse,
            position: bibleToken.position,
            surface: bibleToken.surface,
            strong: bibleToken.strong,
            divineName: bibleToken.divineName,
            otQuote: bibleToken.otQuote,
            wordsOfJesus: bibleToken.wordsOfJesus,
            lemma: bibleLexeme.lemma,
            transliteration: bibleLexeme.transliteration,
            language: bibleLexeme.language,
            gloss: bibleLexeme.gloss,
          })
          .from(bibleToken)
          .leftJoin(bibleLexeme, eq(bibleLexeme.strong, bibleToken.strong))
          .where(
            and(
              eq(bibleToken.translationId, translationId),
              eq(bibleToken.book, usfmOf(input.book)),
              eq(bibleToken.chapter, input.chapter),
            ),
          )
          .orderBy(asc(bibleToken.verse), asc(bibleToken.position)),
        loadOverlayIndex(),
      ]);
      // bible_token is overlay-pure; resolve divine name / OT quotation from the
      // render-time index so the interlinear's study panel gets them too.
      return applyOverlaysToTokens(
        usfmOf(input.book),
        input.chapter,
        rows,
        index,
      );
    }),

  // True interlinear: the chapter's original-language (Greek/Hebrew) words in
  // ORIGINAL word order, each with its inflected surface, transliteration,
  // dictionary lemma + gloss, contextual English, and parsing/morphology code.
  // Empty when this translation/book hasn't been seeded with source tokens, so
  // the reader can fall back to the English reading-order interlinear.
  sourceInterlinear: publicProcedure
    .input(
      z.object({
        translation: z.string().optional(),
        book: z.string(),
        chapter: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const translationId = await resolveTranslation(ctx, input.translation);
      const usfm = usfmOf(input.book);
      const forTranslation = (tid: string) =>
        db
          .select({
            verse: bibleSourceToken.verse,
            position: bibleSourceToken.position,
            surface: bibleSourceToken.surface,
            transliteration: bibleSourceToken.transliteration,
            strong: bibleSourceToken.strong,
            lemma: bibleSourceToken.lemma,
            gloss: bibleSourceToken.gloss,
            english: bibleSourceToken.english,
            morph: bibleSourceToken.morph,
            language: bibleSourceToken.language,
          })
          .from(bibleSourceToken)
          .where(
            and(
              eq(bibleSourceToken.translationId, tid),
              eq(bibleSourceToken.book, usfm),
              eq(bibleSourceToken.chapter, input.chapter),
            ),
          )
          .orderBy(asc(bibleSourceToken.verse), asc(bibleSourceToken.position));

      const rows = await forTranslation(translationId);
      // The OT Hebrew is the same Masoretic text for every translation, so it's
      // seeded once (under the default). Fall back to the default translation
      // when this one has no source tokens for the passage (only the NT Greek
      // differs by textual basis, and those translations carry their own rows).
      if (rows.length === 0) {
        const fallback = await defaultTranslationId();
        if (fallback !== translationId) {
          return forTranslation(fallback);
        }
      }
      return rows;
    }),

  // Strong's lexicon entry for a word (the study panel). Returns the Greek/
  // Hebrew lemma + definition, plus how many times the word occurs in the
  // current translation. Null when the Strong's number isn't in the lexicon.
  lexeme: publicProcedure
    .input(z.object({ translation: z.string().optional(), strong: z.string() }))
    .query(async ({ ctx, input }) => {
      const translationId = await resolveTranslation(ctx, input.translation);
      const [entry] = await db
        .select()
        .from(bibleLexeme)
        .where(eq(bibleLexeme.strong, input.strong))
        .limit(1);
      if (!entry) {
        return null;
      }
      const [counts] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(bibleToken)
        .where(
          and(
            eq(bibleToken.translationId, translationId),
            eq(bibleToken.strong, input.strong),
          ),
        );
      return { ...entry, occurrences: counts?.count ?? 0 };
    }),

  // Every verse where a Strong's number occurs, with its text — word study /
  // concordance (uses the bible_token strong index). Grouped by verse, so a
  // lemma that appears more than once in the same verse is ONE entry with a
  // `count` (e.g. "love those who love you" → Luke 6:32 ×2), not a run of
  // identical-looking duplicate rows.
  wordOccurrences: publicProcedure
    .input(
      z.object({
        translation: z.string().optional(),
        strong: z.string(),
        limit: z.number().int().positive().max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const translationId = await resolveTranslation(ctx, input.translation);
      return db
        .select({
          book: bibleToken.book,
          chapter: bibleToken.chapter,
          verse: bibleToken.verse,
          ref: bibleVerse.ref,
          text: bibleVerse.text,
          count: sql<number>`count(*)::int`,
        })
        .from(bibleToken)
        .innerJoin(
          bibleVerse,
          and(
            eq(bibleVerse.translationId, bibleToken.translationId),
            eq(bibleVerse.book, bibleToken.book),
            eq(bibleVerse.chapter, bibleToken.chapter),
            eq(bibleVerse.verse, bibleToken.verse),
          ),
        )
        .where(
          and(
            eq(bibleToken.translationId, translationId),
            eq(bibleToken.strong, input.strong),
          ),
        )
        .groupBy(
          bibleToken.book,
          bibleToken.chapter,
          bibleToken.verse,
          bibleVerse.ref,
          bibleVerse.text,
          bibleVerse.ordinal,
        )
        .orderBy(asc(bibleVerse.ordinal))
        .limit(input.limit);
    }),

  // Outgoing cross-references for a verse.
  // All cross-references in a chapter, grouped by source verse — powers the
  // OT-quotation tooltips in the reader (one fetch per chapter). Returns deduped
  // display labels + reader links per verse.
  chapterCrossReferences: publicProcedure
    .input(
      z.object({
        translation: z.string().optional(),
        book: z.string(),
        chapter: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const translationId = await resolveTranslation(ctx, input.translation);
      const rows = await db
        .select({
          fromVerse: bibleCrossReference.fromVerse,
          toBook: bibleCrossReference.toBook,
          toChapter: bibleCrossReference.toChapter,
          toVerse: bibleCrossReference.toVerse,
          toVerseEnd: bibleCrossReference.toVerseEnd,
        })
        .from(bibleCrossReference)
        .where(
          and(
            eq(bibleCrossReference.translationId, translationId),
            eq(bibleCrossReference.fromBook, usfmOf(input.book)),
            eq(bibleCrossReference.fromChapter, input.chapter),
          ),
        );

      const byVerse: Record<
        string,
        Array<{
          label: string;
          slug: string;
          chapter: number;
          verse: number | null;
        }>
      > = {};
      for (const r of rows) {
        const book = bookBySlug(r.toBook);
        const name = book?.name ?? r.toBook;
        const range =
          r.toVerse != null
            ? `:${r.toVerse}${r.toVerseEnd ? `-${r.toVerseEnd}` : ''}`
            : '';
        const label = `${name} ${r.toChapter}${range}`;
        const key = String(r.fromVerse);
        byVerse[key] ??= [];
        const list = byVerse[key];
        if (!list.some((x) => x.label === label)) {
          list.push({
            label,
            slug: book?.slug ?? r.toBook,
            chapter: r.toChapter,
            verse: r.toVerse,
          });
        }
      }
      return byVerse;
    }),

  // Every commentary work, ordered for display. Tiny + verse-independent, so the
  // study panel fetches it once and keeps it for the session — it backs the
  // commentary navigator's work list and the header of a followed work even on
  // verses that work doesn't comment on.
  commentaryWorks: publicProcedure.query(async () => {
    return db
      .select({
        id: bibleCommentaryWork.id,
        name: bibleCommentaryWork.name,
        author: bibleCommentaryWork.author,
        year: bibleCommentaryWork.year,
        tradition: bibleCommentaryWork.tradition,
        sourceUrl: bibleCommentaryWork.sourceUrl,
      })
      .from(bibleCommentaryWork)
      .orderBy(asc(bibleCommentaryWork.ordinal));
  }),

  // Works with their offline download size (entry count + total body bytes).
  // Separate from the hot `commentaryWorks` so the panel's online path stays
  // untouched; the Library uses this to show per-work sizes before download.
  commentaryWorksWithSize: publicProcedure.query(async () => {
    return db
      .select({
        id: bibleCommentaryWork.id,
        name: bibleCommentaryWork.name,
        author: bibleCommentaryWork.author,
        year: bibleCommentaryWork.year,
        tradition: bibleCommentaryWork.tradition,
        sourceUrl: bibleCommentaryWork.sourceUrl,
        entryCount: sql<number>`count(${bibleCommentary.id})::int`,
        bytes: sql<number>`coalesce(sum(octet_length(${bibleCommentary.body})), 0)::int`,
      })
      .from(bibleCommentaryWork)
      .leftJoin(
        bibleCommentary,
        eq(bibleCommentary.workId, bibleCommentaryWork.id),
      )
      .groupBy(bibleCommentaryWork.id)
      .orderBy(asc(bibleCommentaryWork.ordinal));
  }),

  // The USFM books a work comments on (+ per-book entry counts) — the manifest
  // an offline download loops over.
  commentaryWorkBooks: publicProcedure
    .input(z.object({ workId: z.string() }))
    .query(async ({ input }) => {
      return db
        .select({
          book: bibleCommentary.book,
          entryCount: sql<number>`count(*)::int`,
        })
        .from(bibleCommentary)
        .where(eq(bibleCommentary.workId, input.workId))
        .groupBy(bibleCommentary.book)
        .orderBy(asc(bibleCommentary.book));
    }),

  // All of a work's entries for one book — the per-book unit an offline download
  // stores. `book` is already a USFM code (from commentaryWorkBooks), not a slug.
  commentaryWorkBook: publicProcedure
    .input(z.object({ workId: z.string(), book: z.string() }))
    .query(async ({ input }) => {
      return db
        .select({
          chapter: bibleCommentary.chapter,
          verse: bibleCommentary.verse,
          verseEnd: bibleCommentary.verseEnd,
          body: bibleCommentary.body,
        })
        .from(bibleCommentary)
        .where(
          and(
            eq(bibleCommentary.workId, input.workId),
            eq(bibleCommentary.book, input.book),
          ),
        )
        .orderBy(asc(bibleCommentary.chapter), asc(bibleCommentary.verse));
    }),

  // Public-domain commentaries for a single verse, across every work, ordered by
  // the work's display ordinal. Commentaries are translation-agnostic (anchored
  // to the canonical book/chapter/verse), so no translation is resolved. Fetched
  // on demand when a verse is selected in the study panel — bodies are large, so
  // unlike cross-references they are NOT prefetched per chapter. Matches both
  // single-verse entries and passage-level entries (verse..verseEnd) that span it.
  verseCommentaries: publicProcedure
    .input(
      z.object({
        book: z.string(),
        chapter: z.number().int().positive(),
        verse: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      return db
        .select({
          workId: bibleCommentaryWork.id,
          workName: bibleCommentaryWork.name,
          author: bibleCommentaryWork.author,
          year: bibleCommentaryWork.year,
          tradition: bibleCommentaryWork.tradition,
          sourceUrl: bibleCommentaryWork.sourceUrl,
          verse: bibleCommentary.verse,
          verseEnd: bibleCommentary.verseEnd,
          body: bibleCommentary.body,
        })
        .from(bibleCommentary)
        .innerJoin(
          bibleCommentaryWork,
          eq(bibleCommentary.workId, bibleCommentaryWork.id),
        )
        .where(
          and(
            eq(bibleCommentary.book, usfmOf(input.book)),
            eq(bibleCommentary.chapter, input.chapter),
            or(
              eq(bibleCommentary.verse, input.verse),
              and(
                lte(bibleCommentary.verse, input.verse),
                gte(bibleCommentary.verseEnd, input.verse),
              ),
            ),
          ),
        )
        .orderBy(asc(bibleCommentaryWork.ordinal), asc(bibleCommentary.verse));
    }),

  crossReferences: publicProcedure
    .input(
      z.object({
        translation: z.string().optional(),
        book: z.string(),
        chapter: z.number().int().positive(),
        verse: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const translationId = await resolveTranslation(ctx, input.translation);
      return db
        .select({
          toBook: bibleCrossReference.toBook,
          toChapter: bibleCrossReference.toChapter,
          toVerse: bibleCrossReference.toVerse,
          toVerseEnd: bibleCrossReference.toVerseEnd,
          kind: bibleCrossReference.kind,
        })
        .from(bibleCrossReference)
        .where(
          and(
            eq(bibleCrossReference.translationId, translationId),
            eq(bibleCrossReference.fromBook, usfmOf(input.book)),
            eq(bibleCrossReference.fromChapter, input.chapter),
            eq(bibleCrossReference.fromVerse, input.verse),
          ),
        );
    }),

  // Media from the lets.church catalog that teaches this verse, for the study
  // panel's "Media" tab. lets.bible can't read web's Postgres (view counts,
  // thumbnails, annotation timestamps), so it proxies to web's internal
  // endpoint server-to-server. The reader passes a book slug; we translate it
  // to the OSIS id the endpoint (and the `bibleRefs` facet) speak.
  relatedMedia: publicProcedure
    .input(
      z.object({
        book: z.string(),
        chapter: z.number().int().positive(),
        verse: z.number().int().positive(),
        limit: z.number().int().min(1).max(12).optional(),
      }),
    )
    .query(async ({ input }): Promise<RelatedMedia> => {
      const empty: RelatedMedia = { items: [], searchUrl: null };
      const osis = osisBookId(usfmOf(input.book));
      if (!osis || !WEB_INTERNAL_URL) {
        return empty;
      }
      try {
        const res = await fetch(
          `${WEB_INTERNAL_URL}/api/internal/media-for-verse`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              book: osis,
              chapter: input.chapter,
              verse: input.verse,
              ...(input.limit ? { limit: input.limit } : {}),
            }),
          },
        );
        if (!res.ok) {
          return empty;
        }
        return mediaForVerseSchema.parse(await res.json());
      } catch {
        // Network error / bad payload → degrade to "no media".
        return empty;
      }
    }),
};
