import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { AuthActions } from '@/components/chrome';
import {
  DEFAULT_INTERLINEAR_OPTIONS,
  Interlinear,
  InterlinearControls,
  type InterlinearOptions,
  SourceInterlinear,
} from '@/components/passage/interlinear';
import {
  footnotesForVerse,
  Passage,
  type WordRef,
} from '@/components/passage/passage';
import type { Block, Run } from '@/components/passage/types';
import {
  BookPicker,
  ChapterPicker,
  TranslationPicker,
} from '@/components/reader-nav';
import { StudyPanel, type StudySelection } from '@/components/study-panel';
import { bookBySlug } from '@/lib/canon';
import { adjacentChapter, chapterLink } from '@/lib/reference';
import {
  chapterQueryOptions,
  persistTranslations,
  resolveTranslationId,
} from '@/local/chapter-cache';
import { precacheTranslation } from '@/local/precache';
import { recordReading, useChapterMarks } from '@/local/store';
import { trpcClient, useTRPC } from '@/trpc/react';

type Trpc = ReturnType<typeof useTRPC>;
type CrossRefs = Awaited<
  ReturnType<typeof trpcClient.bible.chapterCrossReferences.query>
>;

// Cross-references power the OT-quotation overlays — an enhancement, not core
// reading. Wrap the query so it never rejects: offline (or any failure) it
// resolves to an empty map and the chapter still renders. Reuses the tRPC
// queryKey so the loader prefetch and the component's read share one cache entry.
function crossRefsQueryOptions(
  trpc: Trpc,
  params: { book: string; chapter: number; translation?: string },
) {
  const opts = trpc.bible.chapterCrossReferences.queryOptions(params);
  return {
    queryKey: opts.queryKey,
    queryFn: async (): Promise<CrossRefs> => {
      try {
        return await trpcClient.bible.chapterCrossReferences.query(params);
      } catch {
        return {} as CrossRefs;
      }
    },
  };
}

const searchSchema = z.object({
  v: z.coerce.number().int().positive().optional().catch(undefined),
  translation: z.string().optional().catch(undefined),
  view: z.enum(['reading', 'interlinear']).optional().catch(undefined),
});

export const Route = createFileRoute('/bible/$book/$chapter')({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({
    translation: search.translation,
    view: search.view,
  }),
  loader: async ({ context: { queryClient, trpc }, params, deps }) => {
    const book = bookBySlug(params.book);
    const chapter = Number(params.chapter);
    if (
      !book ||
      !Number.isInteger(chapter) ||
      chapter < 1 ||
      chapter > book.chapterCount
    ) {
      throw notFound();
    }
    // The signed-in user's highlights/notes for this chapter, fetched
    // server-side and RETURNED from the loader (not just prefetched), so they're
    // part of the SSR payload and the reader renders them on first paint — no
    // client-side "flash-in", consistent across devices. Empty for anonymous
    // visitors. Best-effort: a failure (e.g. offline client-side nav) must not
    // block the route — the reader falls back to the local-first store, and a
    // non-suspense useQuery doesn't reliably read prefetched data during SSR, so
    // we thread it through loader data instead. Started before the await so it
    // runs in parallel with the rest of the prefetches.
    const serverMarksPromise = queryClient
      .ensureQueryData(
        trpc.library.chapterMarks.queryOptions({
          book: params.book,
          chapter,
        }),
      )
      .catch(() => undefined);
    // Resolve the concrete translation first (from the small metadata queries)
    // so the static reading asset + cross-refs/interlinear all key off the same
    // id on the server and the client.
    const [translations, prefs] = await Promise.all([
      queryClient.ensureQueryData(trpc.bible.translations.queryOptions()),
      queryClient.ensureQueryData(trpc.common.preferences.queryOptions()),
    ]);
    const translationId = resolveTranslationId(
      deps.translation,
      prefs.translation,
      translations,
    );
    await Promise.all([
      queryClient.ensureQueryData(
        chapterQueryOptions({ book: params.book, chapter, translationId }),
      ),
      queryClient.ensureQueryData(
        crossRefsQueryOptions(trpc, {
          book: params.book,
          chapter,
          translation: translationId,
        }),
      ),
      // Prefetch the interlinear words only when that view is requested.
      // Best-effort: offline it just shows the "Loading interlinear…" state.
      deps.view === 'interlinear'
        ? queryClient
            .ensureQueryData(
              trpc.bible.interlinear.queryOptions({
                book: params.book,
                chapter,
                translation: translationId,
              }),
            )
            .catch(() => undefined)
        : null,
      // The original-language source words (true interlinear), so the Greek/
      // Hebrew order renders on first paint without a client round-trip.
      deps.view === 'interlinear'
        ? queryClient
            .ensureQueryData(
              trpc.bible.sourceInterlinear.queryOptions({
                book: params.book,
                chapter,
                translation: translationId,
              }),
            )
            .catch(() => undefined)
        : null,
    ]);
    return { serverMarks: await serverMarksPromise };
  },
  component: Reader,
});

// The first studyable word (lowest position with a Strong's number) of a verse,
// so the toolbar "Study" button can open the word study panel for the verse.
function firstWordOfVerse(blocks: Block[], verse: number): WordRef | null {
  const pick = (
    runs: { text: string; strong?: string; position?: number }[],
  ): WordRef | null => {
    let best: WordRef | null = null;
    for (const r of runs) {
      if (
        r.strong &&
        r.position != null &&
        (best === null || r.position < best.position)
      ) {
        best = {
          verse,
          position: r.position,
          strong: r.strong,
          surface: r.text,
        };
      }
    }
    return best;
  };
  for (const b of blocks) {
    if (b.kind === 'prose' || b.kind === 'descriptive') {
      for (const v of b.verses) {
        if ((v.verse ?? v.num) === verse) {
          const w = pick(v.runs);
          if (w) return w;
        }
      }
    } else if (b.kind === 'poetry') {
      for (const l of b.lines) {
        if ((l.verse ?? l.num) === verse) {
          const w = pick(l.runs);
          if (w) return w;
        }
      }
    } else if (b.kind === 'focusVerse') {
      if ((b.verse.verse ?? b.verse.num) === verse) {
        const w = pick(b.verse.runs);
        if (w) return w;
      }
    }
  }
  return null;
}

// All runs of a verse (concatenated across its prose segments / poetry lines), so
// the study panel can render the verse text with each word linking to its study.
function verseRunsFor(blocks: Block[], verse: number): Run[] {
  const out: Run[] = [];
  const add = (v: { verse?: number; num?: number; runs: Run[] }) => {
    if ((v.verse ?? v.num) === verse) {
      out.push(...v.runs);
    }
  };
  for (const b of blocks) {
    if (b.kind === 'prose' || b.kind === 'descriptive') {
      b.verses.forEach(add);
    } else if (b.kind === 'poetry') {
      b.lines.forEach(add);
    } else if (b.kind === 'focusVerse') {
      add(b.verse);
    }
  }
  return out;
}

function Reader() {
  const { book: bookSlug, chapter: chapterStr } = Route.useParams();
  const { v, translation, view } = Route.useSearch();
  const trpc = useTRPC();
  const chapterNum = Number(chapterStr);
  const interlinearView = view === 'interlinear';
  const [interlinearOptions, setInterlinearOptions] =
    useState<InterlinearOptions>(DEFAULT_INTERLINEAR_OPTIONS);
  const { data: translations } = useSuspenseQuery(
    trpc.bible.translations.queryOptions(),
  );
  const { data: prefs } = useSuspenseQuery(
    trpc.common.preferences.queryOptions(),
  );
  // URL ?translation= wins, then the saved preference, then the default. Resolved
  // before the chapter query so its key matches the loader's prefetch.
  const currentTranslation = resolveTranslationId(
    translation,
    prefs.translation,
    translations,
  );
  const { data } = useSuspenseQuery(
    chapterQueryOptions({
      book: bookSlug,
      chapter: chapterNum,
      translationId: currentTranslation,
    }),
  );
  // Interlinear words — only fetched when that view is active (prefetched by the
  // loader, so it's ready on first paint).
  const { data: interlinearRows } = useQuery({
    ...trpc.bible.interlinear.queryOptions({
      book: bookSlug,
      chapter: chapterNum,
      translation: currentTranslation,
    }),
    enabled: interlinearView,
  });
  // Original-language source words (true interlinear) — Greek/Hebrew in original
  // word order with morphology. Present only for seeded books; when absent the
  // interlinear falls back to the English reading-order view above.
  const { data: sourceRows } = useQuery({
    ...trpc.bible.sourceInterlinear.queryOptions({
      book: bookSlug,
      chapter: chapterNum,
      translation: currentTranslation,
    }),
    enabled: interlinearView,
  });
  const hasSource = (sourceRows?.length ?? 0) > 0;
  // The "Original" word-order option shows the true source order; "English
  // (reverse)" shows the reading-order interlinear. Without source data we keep
  // the reading-order view regardless.
  const showSource = hasSource && !interlinearOptions.englishFirst;
  // Highlights + notes: the server is the source of truth (prefetched in the
  // loader → SSR'd, so they render on first paint and stay consistent across
  // devices). The local-first store overlays this for optimistic writes +
  // offline; anonymous users have empty serverMarks and use their local store.
  // Server marks come from the loader (part of the SSR payload), so highlights /
  // note markers render on first paint. Undefined when offline (best-effort
  // loader fetch) → the reader falls back to the local store.
  const { serverMarks } = Route.useLoaderData();
  const marks = useChapterMarks(bookSlug, chapterNum, serverMarks ?? undefined);
  // Cross-references for the chapter — power the OT-quotation tooltips. Resilient
  // (returns {} offline / on failure) so the reader still renders without them.
  const { data: crossRefs } = useSuspenseQuery(
    crossRefsQueryOptions(trpc, {
      book: bookSlug,
      chapter: chapterNum,
      translation: currentTranslation,
    }),
  );
  // Verse and word selection are mutually exclusive — one selection state, so a
  // word never coexists with a selected verse. The study panel reads this and
  // renders the matching view (a word still knows its verse for context). A
  // direct ?v= visit does NOT select (no panel / persistent highlight) — it just
  // scrolls to and flashes the verse (see flashVerse below); the reader taps to
  // select.
  const [selection, setSelection] = useState<StudySelection | null>(null);
  const selectedVerse = selection?.kind === 'verse' ? selection.verse : null;
  const selectedWord = selection?.kind === 'word' ? selection.word : null;
  // The verse providing context for the panel (the selected verse, or the verse
  // a selected word belongs to).
  const contextVerse =
    selection?.kind === 'verse'
      ? selection.verse
      : (selection?.word.verse ?? null);
  // Clear any selection when navigating to a different passage or verse ref, so
  // a deep-link visit starts clean (nothing selected, just the flash below).
  useEffect(() => {
    setSelection(null);
  }, [v, bookSlug, chapterNum]);

  // Direct ?v= visit: scroll the verse to the center of the viewport and flash a
  // transient highlight that fades out. `flashVerse` drives the `verse-flash`
  // class in Passage; we clear it after the animation so it can retrigger and
  // doesn't linger in the DOM. Reading view only (the interlinear renders word
  // stacks, not verse spans).
  const [flashVerse, setFlashVerse] = useState<number | null>(v ?? null);
  useEffect(() => {
    if (v == null || interlinearView) {
      setFlashVerse(null);
      return;
    }
    setFlashVerse(v);
    // Center the verse. Verse deep-links navigate with `resetScroll: false` (see
    // chapterLink in lib/reference.ts), so the router doesn't scroll to the top
    // after this effect — a single scroll on the next frame is enough on both a
    // fresh load and client-side navigation.
    const raf = requestAnimationFrame(() => {
      document
        .querySelector(`[data-verse="${v}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    const clearFlash = setTimeout(() => setFlashVerse(null), 2000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(clearFlash);
    };
  }, [v, bookSlug, chapterNum, interlinearView]);

  // Record the chapter view (local-first) for "Continue reading" / "Recent".
  useEffect(() => {
    recordReading(bookSlug, chapterNum, v);
  }, [bookSlug, chapterNum, v]);

  // Keep the translations list available offline (for translation resolution).
  useEffect(() => {
    persistTranslations(translations);
  }, [translations]);

  // Make the whole active translation available offline (reading + search) in an
  // idle background pass — replaces the manual download. Runs once per version.
  useEffect(() => {
    precacheTranslation(currentTranslation);
  }, [currentTranslation]);

  const book = bookBySlug(bookSlug);
  if (!book) {
    return null;
  }

  // Shared study-panel props — rendered as a side rail (desktop) or a bottom
  // drawer (mobile) from the same state.
  const studyPanelProps = {
    selection,
    translation: currentTranslation,
    book: bookSlug,
    bookName: book.name,
    chapter: chapterNum,
    verseText:
      contextVerse != null ? (data?.verses[String(contextVerse)] ?? '') : '',
    verseRuns:
      contextVerse != null && data
        ? verseRunsFor(data.blocks, contextVerse)
        : [],
    // Footnotes (with their chapter letters), cross-references, and source-text
    // overlays for the selected verse — listed in the study panel's verse view.
    verseFootnotes:
      contextVerse != null && data
        ? footnotesForVerse(data.blocks, contextVerse)
        : [],
    verseCrossRefs:
      contextVerse != null ? (crossRefs[String(contextVerse)] ?? []) : [],
    color:
      contextVerse != null
        ? (marks.highlights[String(contextVerse)] ?? null)
        : null,
    hasNote: contextVerse != null ? marks.notes.includes(contextVerse) : false,
    onClose: () => setSelection(null),
    onSelectVerse: (n: number) => setSelection({ kind: 'verse', verse: n }),
    onSelectWord: (word: WordRef) => setSelection({ kind: 'word', word }),
    onStudyFirstWord: () => {
      if (selectedVerse == null || !data) {
        return;
      }
      const w = firstWordOfVerse(data.blocks, selectedVerse);
      if (w) {
        setSelection({ kind: 'word', word: w });
      }
    },
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper-soft">
      {/* reading chrome */}
      <header className="sticky top-0 z-30 flex h-15 flex-shrink-0 items-center gap-2 border-line border-b bg-paper-soft/85 px-3 backdrop-blur-sm sm:gap-[18px] sm:px-[26px]">
        <Link
          to="/"
          title="Home"
          className="inline-flex items-center gap-[7px] font-semibold text-[13.5px] text-muted"
        >
          <span className="text-[15px]">←</span>
          <span className="hidden sm:inline">Home</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <BookPicker book={book} />
          <ChapterPicker book={book} chapter={chapterNum} />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Compare + interlinear are launched per-translation from the version
              picker. The reading↔interlinear mode is reflected in the trigger. */}
          <TranslationPicker
            book={bookSlug}
            chapter={chapterNum}
            current={currentTranslation}
            interlinear={interlinearView}
          />
          <AuthActions />
        </div>
      </header>

      {/* Interlinear controls — a full-width second sticky header. */}
      {interlinearView ? (
        <InterlinearControls
          options={interlinearOptions}
          onChange={setInterlinearOptions}
          parsingAvailable={showSource}
        />
      ) : null}

      {/* reading body — the study panel overlays the page as a Base UI drawer
          (a right rail on desktop, a bottom sheet on mobile), so the reading
          column never shifts when it opens. */}
      <div className="flex flex-1">
        <div className="min-w-0 flex-1 px-6 pt-[46px] pb-16">
          <div
            className={`mx-auto ${interlinearView ? 'max-w-[880px]' : 'max-w-[660px]'}`}
          >
            {/* Reading mode shows the serif chapter heading (design element);
                interlinear omits it — the header pickers + controls bar already
                give the book/chapter context, and it saves vertical space. */}
            {interlinearView ? null : (
              <div className="mb-[34px] text-center">
                <div className="font-bold text-[12px] text-gold-soft uppercase tracking-[0.16em]">
                  {book.name}
                </div>
                <div className="mt-1.5 font-serif text-[46px] text-ink-strong leading-none">
                  Chapter {chapterNum}
                </div>
              </div>
            )}

            {interlinearView ? (
              showSource && sourceRows ? (
                <SourceInterlinear
                  rows={sourceRows}
                  selectedWord={
                    selectedWord
                      ? {
                          verse: selectedWord.verse,
                          position: selectedWord.position,
                        }
                      : null
                  }
                  onSelectWord={(word) => setSelection({ kind: 'word', word })}
                  options={interlinearOptions}
                  verseNumbers={prefs.verseNumbers}
                />
              ) : interlinearRows ? (
                <Interlinear
                  rows={interlinearRows}
                  selectedWord={
                    selectedWord
                      ? {
                          verse: selectedWord.verse,
                          position: selectedWord.position,
                        }
                      : null
                  }
                  onSelectWord={(word) => setSelection({ kind: 'word', word })}
                  options={interlinearOptions}
                  verseNumbers={prefs.verseNumbers}
                  redLetter={prefs.redLetter}
                />
              ) : (
                <p className="text-center text-[14px] text-faint">
                  Loading interlinear…
                </p>
              )
            ) : data ? (
              <Passage
                blocks={data.blocks}
                selectedVerse={selectedVerse}
                onSelectVerse={(n) =>
                  setSelection(n == null ? null : { kind: 'verse', verse: n })
                }
                selectedWord={
                  selectedWord
                    ? {
                        verse: selectedWord.verse,
                        position: selectedWord.position,
                      }
                    : null
                }
                onSelectWord={(word) => setSelection({ kind: 'word', word })}
                highlights={marks.highlights}
                notedVerses={marks.notes}
                crossRefs={crossRefs}
                redLetter={prefs.redLetter}
                verseNumbers={prefs.verseNumbers}
                textSize={prefs.textSize}
                divineName={prefs.divineName}
                sourceOverlay={prefs.sourceOverlay}
                flashVerse={flashVerse}
              />
            ) : (
              <p className="text-center text-[14px] text-faint">
                This chapter isn’t available.
              </p>
            )}

            <div className="mt-[34px] flex items-center justify-between border-line border-t pt-[18px]">
              {selection?.kind === 'verse' ? (
                <span className="text-[12.5px] text-faint">
                  Verse {selection.verse} selected
                </span>
              ) : selection?.kind === 'word' ? (
                <span className="text-[12.5px] text-faint">
                  Studying “{selection.word.surface}” ({book.name} {chapterNum}:
                  {selection.word.verse})
                </span>
              ) : (
                <span className="text-[12.5px] text-faint">
                  Tap a verse to copy, compare, or open it in Study.
                </span>
              )}
              <ChapterNavLinks slug={bookSlug} chapter={chapterNum} />
            </div>
          </div>
        </div>
      </div>

      {/* The study panel is a Base UI drawer that overlays the page (a non-modal
          rail under the header on desktop; a bottom sheet on mobile), so the
          reading column never shifts when it opens/closes. In interlinear view it
          starts below the controls bar. */}
      <StudyPanel {...studyPanelProps} belowControls={interlinearView} />
    </div>
  );
}

function ChapterNavLinks({ slug, chapter }: { slug: string; chapter: number }) {
  const prev = adjacentChapter(slug, chapter, -1);
  const next = adjacentChapter(slug, chapter, 1);
  return (
    <span className="flex items-center gap-4 text-[12.5px]">
      {prev ? (
        <Link
          {...chapterLink(prev.book, prev.chapter)}
          className="text-muted-2 hover:text-gold"
        >
          ‹ {prev.book.name} {prev.chapter}
        </Link>
      ) : null}
      {next ? (
        <Link
          {...chapterLink(next.book, next.chapter)}
          className="font-semibold text-gold"
        >
          {next.book.name} {next.chapter} ›
        </Link>
      ) : null}
    </span>
  );
}
