import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { AuthActions } from '@/components/chrome';
import { LiveSearchBox } from '@/components/live-search-box';
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
import { TranslationPicker } from '@/components/reader-nav';
import { StudyPanel, type StudySelection } from '@/components/study-panel';
import { bookBySlug, type CanonBook } from '@/lib/canon';
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
  fromSearch: z.string().optional().catch(undefined),
  fromTranslation: z.string().optional().catch(undefined),
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
      // Powers the header search bar (example chips/topics); SSR'd so the bar
      // renders without a client round-trip.
      queryClient.ensureQueryData(trpc.home.searchSuggestions.queryOptions()),
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

// Link/navigate target for an adjacent chapter, preserving the interlinear view so
// the reading↔interlinear mode carries across chapters. Shared by the fixed side
// chevrons, the bottom nav, and the mobile swipe gesture. chapterLink already
// resetScrolls to the top of the new chapter.
function chapterNavLink(
  target: { book: CanonBook; chapter: number },
  interlinear: boolean,
) {
  return {
    ...chapterLink(target.book, target.chapter),
    ...(interlinear ? { search: { view: 'interlinear' as const } } : {}),
  };
}

function Reader() {
  const { book: bookSlug, chapter: chapterStr } = Route.useParams();
  const { v, translation, view, fromSearch, fromTranslation } =
    Route.useSearch();
  const trpc = useTRPC();
  const navigate = useNavigate();
  // Start point of an in-progress touch, for the mobile swipe-to-page gesture.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
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
  // Whether this translation has its own Strong's-tagged English tokens (the
  // reading-order "English (reverse)" interlinear + word study). Public-domain
  // texts without per-word Strong's (e.g. WEB) only get the original-language view.
  const currentTranslationRow = translations.find(
    (t) => t.id === currentTranslation,
  );
  const reverseAvailable = currentTranslationRow?.hasEnglishInterlinear ?? true;
  // The "Original" word-order option shows the true source order; "English
  // (reverse)" shows the reading-order interlinear. Without source data, or when
  // the translation has no English tokens, we keep the original-language view.
  const showSource =
    hasSource && (!interlinearOptions.englishFirst || !reverseAvailable);
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
  // Verses stack — several can be selected at once, each getting its own study
  // section. Word study stays single.
  const selectedVerses = selection?.kind === 'verse' ? selection.verses : [];
  const selectedWord = selection?.kind === 'word' ? selection.word : null;
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

  const prevChapter = adjacentChapter(bookSlug, chapterNum, -1);
  const nextChapter = adjacentChapter(bookSlug, chapterNum, 1);

  // Mobile swipe-to-page: a clear horizontal swipe over the reading body pages to
  // the adjacent chapter (swipe left → next, right → prev). Gated on distance +
  // horizontal dominance so it never fires on a vertical scroll, a tap (verse
  // select), or a long-press (word study, which cancels itself on move). The fixed
  // side chevrons are hidden on mobile (this replaces them); desktop keeps them.
  const onTouchStart = (e: React.TouchEvent) => {
    swipeStart.current =
      e.touches.length === 1
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) {
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.6) {
      return;
    }
    const target = dx < 0 ? nextChapter : prevChapter;
    if (target) {
      navigate(chapterNavLink(target, interlinearView));
    }
  };

  // Tap a verse in the text: add it to the stack if new, remove it if already
  // selected (toggle), and start a fresh verse selection when a word is being
  // studied. Removing the last verse closes the panel.
  const toggleVerse = (n: number) =>
    setSelection((cur) => {
      if (cur?.kind !== 'verse') {
        return { kind: 'verse', verses: [n] };
      }
      const verses = cur.verses.includes(n)
        ? cur.verses.filter((x) => x !== n)
        : [...cur.verses, n];
      return verses.length ? { kind: 'verse', verses } : null;
    });
  // Drop one verse's section from the stack (its × button).
  const removeVerse = (n: number) =>
    setSelection((cur) => {
      if (cur?.kind !== 'verse') {
        return cur;
      }
      const verses = cur.verses.filter((x) => x !== n);
      return verses.length ? { kind: 'verse', verses } : null;
    });

  // Per-verse study data — one entry per selected verse, stacked in the panel.
  const versePanelData = data
    ? selectedVerses.map((vnum) => ({
        verse: vnum,
        verseText: data.verses[String(vnum)] ?? '',
        verseRuns: verseRunsFor(data.blocks, vnum),
        // Footnotes (with their chapter letters), cross-references, and
        // source-text overlays for this verse — listed in its verse view.
        verseFootnotes: footnotesForVerse(data.blocks, vnum),
        verseCrossRefs: crossRefs[String(vnum)] ?? [],
        color: marks.highlights[String(vnum)] ?? null,
        hasNote: marks.notes.includes(vnum),
      }))
    : [];

  // Shared study-panel props — rendered as a side rail (desktop) or a bottom
  // drawer (mobile) from the same state.
  const studyPanelProps = {
    selection,
    translation: currentTranslation,
    book: bookSlug,
    bookName: book.name,
    chapter: chapterNum,
    verses: versePanelData,
    wordVerseText:
      selectedWord != null
        ? (data?.verses[String(selectedWord.verse)] ?? '')
        : '',
    onClose: () => setSelection(null),
    // Word view's "back to verse" collapses to that single verse.
    onSelectVerse: (n: number) => setSelection({ kind: 'verse', verses: [n] }),
    onSelectWord: (word: WordRef) => setSelection({ kind: 'word', word }),
    onStudyFirstWord: (verse: number) => {
      if (!data) {
        return;
      }
      const w = firstWordOfVerse(data.blocks, verse);
      if (w) {
        setSelection({ kind: 'word', word: w });
      }
    },
    onRemoveVerse: removeVerse,
  };

  return (
    <div className="bg-paper-soft flex min-h-screen flex-col">
      {/* reading chrome */}
      <header className="border-line bg-paper-soft/85 sticky top-0 z-30 flex h-15 flex-shrink-0 items-center gap-2 border-b px-3 backdrop-blur-sm sm:gap-[18px] sm:px-[26px]">
        {fromSearch ? (
          <Link
            to="/search"
            search={{
              q: fromSearch,
              ...(fromTranslation ? { translation: fromTranslation } : {}),
            }}
            title="Back to search results"
            className="text-muted inline-flex items-center gap-[7px] text-[13.5px] font-semibold"
          >
            <span className="text-[15px]">←</span>
            <span className="hidden sm:inline">Search results</span>
          </Link>
        ) : (
          <Link
            to="/"
            title="Home"
            className="text-muted inline-flex items-center gap-[7px] text-[13.5px] font-semibold"
          >
            <span className="text-[15px]">←</span>
            <span className="hidden sm:inline">Home</span>
          </Link>
        )}
        {/* The header search bar doubles as the navigator: typing a book/
            reference opens the same book→chapter→verse quick-pick the homepage
            search uses, replacing the old book/chapter dropdowns. */}
        <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-2">
          <div className="w-full max-w-[460px]">
            <LiveSearchBox
              size="sm"
              showChips={false}
              placeholder={`${book.name} ${chapterNum} · jump or search…`}
              context={{ book: bookSlug, chapter: chapterNum }}
            />
          </div>
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
          reverseAvailable={reverseAvailable}
        />
      ) : null}

      {/* reading body — the study panel overlays the page as a Base UI drawer
          (a right rail on desktop, a bottom sheet on mobile), so the reading
          column never shifts when it opens. Touch handlers drive the mobile
          swipe-to-page-chapter gesture. */}
      <div
        className="flex flex-1"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="min-w-0 flex-1 px-6 pt-[46px] pb-16">
          {/* select-none on the reading column: verse/word selection is driven by
              taps (and long-press for word study), so native text selection isn't
              a supported affordance — disabling it avoids stray highlights and the
              mobile long-press selection callout. The study panel (rendered
              outside this column) stays selectable for copying. */}
          <div
            className={`mx-auto select-none ${interlinearView ? 'max-w-[880px]' : 'max-w-[660px]'}`}
          >
            {/* Reading mode shows the serif chapter heading (design element);
                interlinear omits it — the header pickers + controls bar already
                give the book/chapter context, and it saves vertical space. */}
            {interlinearView ? null : (
              <div className="mb-[34px] text-center">
                <div className="text-gold-soft text-[12px] font-bold tracking-[0.16em] uppercase">
                  {book.name}
                </div>
                <div className="text-ink-strong mt-1.5 font-serif text-[46px] leading-none">
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
                <p className="text-faint text-center text-[14px]">
                  Loading interlinear…
                </p>
              )
            ) : data ? (
              <Passage
                blocks={data.blocks}
                selectedVerses={selectedVerses}
                onSelectVerse={toggleVerse}
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
              <p className="text-faint text-center text-[14px]">
                This chapter isn’t available.
              </p>
            )}

            <div className="border-line mt-[34px] flex items-center justify-between gap-3 border-t pt-[18px]">
              <BottomChapterLink
                target={prevChapter}
                dir="left"
                interlinear={interlinearView}
              />
              <span className="text-faint min-w-0 flex-1 text-center text-[12.5px]">
                {selection?.kind === 'verse'
                  ? selection.verses.length === 1
                    ? `Verse ${selection.verses[0]} selected`
                    : `${selection.verses.length} verses selected`
                  : selection?.kind === 'word'
                    ? `Studying “${selection.word.surface}” (${book.name} ${chapterNum}:${selection.word.verse})`
                    : 'Tap a verse to copy, compare, or open it in Study.'}
              </span>
              <BottomChapterLink
                target={nextChapter}
                dir="right"
                interlinear={interlinearView}
              />
            </div>

            {/* Translation attribution / copyright courtesy line. */}
            {currentTranslationRow?.attribution ? (
              <p className="text-faint mt-5 text-center text-[11px]">
                {currentTranslationRow.name} ({currentTranslationRow.id}).{' '}
                {currentTranslationRow.attributionUrl ? (
                  <a
                    href={currentTranslationRow.attributionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="decoration-line-strong hover:text-muted-2 underline underline-offset-2"
                  >
                    {currentTranslationRow.attribution}
                  </a>
                ) : (
                  currentTranslationRow.attribution
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Large prev/next chapter buttons, fixed to the viewport and vertically
          centered, flanking the centered reading/interlinear column (they hug the
          screen edges on narrow viewports). Below the header (z-30) and the study
          panel (z-40/50), so those cover them when open. */}
      <ChapterNavButtons
        slug={bookSlug}
        chapter={chapterNum}
        interlinear={interlinearView}
      />

      {/* The study panel is a Base UI drawer that overlays the page (a non-modal
          rail under the header on desktop; a bottom sheet on mobile), so the
          reading column never shifts when it opens/closes. In interlinear view it
          starts below the controls bar. */}
      <StudyPanel {...studyPanelProps} belowControls={interlinearView} />
    </div>
  );
}

function ChevronIcon({
  dir,
  className,
}: {
  dir: 'left' | 'right';
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <title>{dir === 'left' ? 'Previous' : 'Next'}</title>
      <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

// One end of the bottom prev/next chapter nav: a chevron + the target's name (next
// is gold-emphasized). Renders an empty spacer at canon edges (no prev on Genesis 1,
// no next on the last chapter) so the centered status text stays balanced.
function BottomChapterLink({
  target,
  dir,
  interlinear,
}: {
  target: { book: CanonBook; chapter: number } | null;
  dir: 'left' | 'right';
  interlinear: boolean;
}) {
  if (!target) {
    return <span className="w-16 shrink-0" aria-hidden="true" />;
  }
  const label = `${target.book.name} ${target.chapter}`;
  return (
    <Link
      {...chapterNavLink(target, interlinear)}
      aria-label={`${dir === 'left' ? 'Previous' : 'Next'} chapter — ${label}`}
      className={`hover:text-gold inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-2 text-[13px] whitespace-nowrap transition-colors ${
        dir === 'right' ? 'text-gold font-semibold' : 'text-muted-2'
      }`}
    >
      {dir === 'left' ? <ChevronIcon dir="left" className="size-4" /> : null}
      <span>{label}</span>
      {dir === 'right' ? <ChevronIcon dir="right" className="size-4" /> : null}
    </Link>
  );
}

// Large plain prev/next chevrons fixed at the vertical center of the viewport,
// flanking the column. A pointer-events-none, centered max-width track positions
// them just outside the reading/interlinear column; only the chevrons take pointer
// events. Hidden on mobile (`hidden sm:block`) — there the swipe gesture + the
// bottom nav handle paging. `interlinear` widens the track to the interlinear column.
function ChapterNavButtons({
  slug,
  chapter,
  interlinear,
}: {
  slug: string;
  chapter: number;
  interlinear: boolean;
}) {
  const prev = adjacentChapter(slug, chapter, -1);
  const next = adjacentChapter(slug, chapter, 1);
  // Plain chevrons (no button chrome): a padded, transparent hit area with a faint
  // arrow that warms to gold and nudges toward the page on hover.
  const btn =
    'pointer-events-auto absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md p-2 text-muted-2/70 transition-[color,translate] duration-200 hover:text-gold focus-visible:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 sm:p-3';
  return (
    <div className="pointer-events-none fixed inset-0 z-20 hidden sm:block">
      <div
        className={`relative mx-auto h-full w-full ${interlinear ? 'max-w-[1040px]' : 'max-w-[820px]'}`}
      >
        {prev ? (
          <Link
            {...chapterNavLink(prev, interlinear)}
            aria-label={`Previous chapter — ${prev.book.name} ${prev.chapter}`}
            title={`${prev.book.name} ${prev.chapter}`}
            className={`${btn} left-1 hover:-translate-x-0.5 sm:left-2`}
          >
            <ChevronIcon dir="left" className="size-8 sm:size-10" />
          </Link>
        ) : null}
        {next ? (
          <Link
            {...chapterNavLink(next, interlinear)}
            aria-label={`Next chapter — ${next.book.name} ${next.chapter}`}
            title={`${next.book.name} ${next.chapter}`}
            className={`${btn} right-1 hover:translate-x-0.5 sm:right-2`}
          >
            <ChevronIcon dir="right" className="size-8 sm:size-10" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
