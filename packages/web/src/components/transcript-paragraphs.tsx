import { useStore } from '@nanostores/react';
import {
  IconBible,
  IconCheck,
  IconChevronDown,
  IconExternalLink,
  IconLink,
  IconSearch,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import bSearch from 'binary-search';
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  LcMenu,
  MenuItemButton,
  MenuItemRouterLink,
} from '@/components/lc-menu';
import { LcTooltip } from '@/components/lc-tooltip';
import { useCopied } from '@/hooks/use-copied';
import { $currentTime, $setPlayAt } from '@/stores/player';
import {
  buildLetsBibleUrl,
  formatBibleRef,
  parseBibleMetadata,
} from '@/util/bible-url';
import { formatTime } from '@/util/format';
import { scrollToCenterWithin } from '@/util/scroll-container';

// Strip leading/trailing punctuation from a word, preserving inner
// apostrophes ("can't" → "can't"). Mirrors the backend's `normalizeWord`
// in annotate-transcript.ts, minus the lowercasing — search queries
// preserve case so brand names / proper nouns match downstream.
export function stripWordPunctuation(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '');
}

// faster-whisper sometimes splits a hyphenated word into two timed tokens
// ("co" + "-labor"); they're stored verbatim, so naively joining words
// with spaces strands the hyphen ("co -labor"). Treat a token that starts
// with a hyphen+letter (or a previous token ending in letter+hyphen) as a
// continuation, so the pair renders glued ("co-labor").
export function wordsJoinWithoutSpace(prev: string, next: string): boolean {
  return /\p{L}-$/u.test(prev) || /^-\p{L}/u.test(next);
}

export type TranscriptWord = { word: string; start: number; end: number };

export type TranscriptAnnotation = {
  kind: 'OUTLINE' | 'BIBLE' | 'KEYWORD';
  startWord: number | null;
  endWord: number | null;
  // oxlint-disable-next-line typescript/no-empty-object-type -- matches the JSON-safe shape from `getTranscriptParagraphs` (see comment in `trpc/procedures/media.ts`).
  metadata: { [key: string]: {} };
};

export type TranscriptParagraph = {
  order: number;
  start: number;
  end: number;
  // Raw diarization label (SPEAKER_NN). Carried through but not displayed.
  speaker: string | null;
  // Resolved named speaker (override ?? diarization → attribution → Speaker.name),
  // or null when the voice isn't attributed to a named speaker.
  speakerName: string | null;
  text: string;
  words: Array<TranscriptWord>;
  annotations: Array<TranscriptAnnotation>;
};

type Props = {
  paragraphs: Array<TranscriptParagraph>;
  isTranscriptProcessing?: boolean;
  // When set (paragraph-search results), per-word matches get the same
  // orange `<mark>` styling the legacy text-only results view used. Each
  // whitespace-separated term is matched case-insensitively as a regex
  // substring against each word.
  highlightQuery?: string;
};

type WordChunk = {
  annotation: TranscriptAnnotation | null;
  // Canonical key shared by every chunk that represents the same logical
  // annotation in this paragraph (e.g. the same Bible reference cited
  // twice). Used to drive the hover-highlight: hovering a pill below the
  // paragraph paints every chunk whose `key` matches the pill's. null
  // for unannotated chunks.
  key: string | null;
  startIdx: number; // inclusive
  endIdx: number; // exclusive
};

// One reference pill rendered under a paragraph. Deduped per paragraph by
// `key` so a reference cited twice in the same paragraph shows once.
type Pill =
  | { kind: 'BIBLE'; key: string; ref: string; url: string }
  | { kind: 'KEYWORD'; key: string; text: string };

// Build a per-word annotation index for the paragraph. Overlap policy: BIBLE
// wins over KEYWORD (scripture refs are higher-signal than generic keyword
// highlights) — BIBLE fills first, KEYWORD only paints empty cells.
// Then collapse consecutive same-reference cells into chunks for rendering,
// and emit a deduped list of `pills` (one per unique annotation key) for
// the new under-paragraph reference rail.
function indexParagraph(paragraph: TranscriptParagraph): {
  outline: TranscriptAnnotation | null;
  chunks: Array<WordChunk>;
  pills: Array<Pill>;
} {
  const outline =
    paragraph.annotations.find((a) => a.kind === 'OUTLINE') ?? null;

  const byWord: Array<TranscriptAnnotation | null> = new Array(
    paragraph.words.length,
  ).fill(null);

  for (const a of paragraph.annotations) {
    if (a.kind !== 'BIBLE' || a.startWord == null || a.endWord == null)
      continue;
    const lo = Math.max(0, a.startWord);
    const hi = Math.min(byWord.length, a.endWord);
    for (let i = lo; i < hi; i++) byWord[i] = a;
  }
  for (const a of paragraph.annotations) {
    if (a.kind !== 'KEYWORD' || a.startWord == null || a.endWord == null)
      continue;
    const lo = Math.max(0, a.startWord);
    const hi = Math.min(byWord.length, a.endWord);
    for (let i = lo; i < hi; i++) {
      if (byWord[i] === null) byWord[i] = a;
    }
  }

  // Canonical key per word position. BIBLE keys are derived from the
  // (book, chapter, verse, endChapter, endVerse) tuple so the LLM
  // emitting per-word markdown links (`[John](#bible?...) [3:16](#bible?...)`
  // = two rows) still collapses to one pill. KEYWORD keys are the
  // joined span text — distinct keywords get distinct pills, repeated
  // keywords don't duplicate.
  function bibleKey(ann: TranscriptAnnotation): string {
    const m = ann.metadata as {
      book?: unknown;
      chapter?: unknown;
      verse?: unknown;
      endChapter?: unknown;
      endVerse?: unknown;
    };
    return `BIBLE:${m.book ?? ''}:${m.chapter ?? ''}:${m.verse ?? ''}:${m.endChapter ?? ''}:${m.endVerse ?? ''}`;
  }

  // First pass: per-word key, for chunk merging.
  const wordKeys = byWord.map((ann) => {
    if (!ann) return null;
    if (ann.kind === 'BIBLE') return bibleKey(ann);
    // KEYWORD key uses the WORD index so consecutive KEYWORD cells
    // merge into one chunk; we replace with a span-text-derived key
    // after the chunk pass when we know the actual span boundaries.
    return 'KEYWORD';
  });

  // Build chunks first using the simple per-word key.
  const rawChunks: Array<WordChunk> = [];
  {
    let i = 0;
    while (i < wordKeys.length) {
      const key = wordKeys[i];
      let j = i + 1;
      while (j < wordKeys.length && wordKeys[j] === key) j++;
      rawChunks.push({
        annotation: byWord[i] ?? null,
        key: key ?? null,
        startIdx: i,
        endIdx: j,
      });
      i = j;
    }
  }

  // Second pass: refine KEYWORD chunk keys to the joined-span text so
  // two distinct keyword phrases get distinct pills + hover targets.
  const chunks: Array<WordChunk> = rawChunks.map((c) => {
    if (c.annotation?.kind !== 'KEYWORD') return c;
    const spanText = paragraph.words
      .slice(c.startIdx, c.endIdx)
      .map((w) => stripWordPunctuation(w.word))
      .filter((w) => w.length > 0)
      .join(' ');
    return { ...c, key: `KEYWORD:${spanText.toLowerCase()}` };
  });

  // Deduplicate chunks into pills, preserving first-occurrence order.
  const pills: Array<Pill> = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    if (!c.annotation || !c.key || seen.has(c.key)) continue;
    if (c.annotation.kind === 'BIBLE') {
      const meta = parseBibleMetadata(c.annotation.metadata);
      const url = meta ? buildLetsBibleUrl(meta) : null;
      if (!meta || !url) continue;
      pills.push({ kind: 'BIBLE', key: c.key, ref: formatBibleRef(meta), url });
      seen.add(c.key);
    } else if (c.annotation.kind === 'KEYWORD') {
      const spanText = paragraph.words
        .slice(c.startIdx, c.endIdx)
        .map((w) => stripWordPunctuation(w.word))
        .filter((w) => w.length > 0)
        .join(' ');
      if (spanText.length === 0) continue;
      pills.push({ kind: 'KEYWORD', key: c.key, text: spanText });
      seen.add(c.key);
    }
  }

  return { outline, chunks, pills };
}

// Render a single word as the existing seek-on-click button. Lifted out so
// both the un-annotated and annotated chunks share the same markup — the
// active-word highlight stays on the inner button regardless of whether
// the chunk is wrapped in an annotation span. Every word gets the same
// per-word hover background: annotation highlights now live below the
// paragraph as pills (and only paint the span on pill hover), so there's
// no inline treatment for the per-word hover to compete with.
//
// `isMatched` (search-result mode) overrides both active and hover bg
// with the orange match indicator so the user can spot their query
// term in context.
function WordButton({
  word,
  isActive,
  isMatched,
  onSeek,
}: {
  word: TranscriptWord;
  isActive: boolean;
  isMatched: boolean;
  onSeek: (start: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSeek(word.start)}
      // No horizontal padding — every word would get it, which
      // visibly inflates inter-word spacing. The bg hugs the letters
      // tightly when active; box size is identical between states so
      // no layout jitter as the highlight advances.
      className={`cursor-pointer appearance-none rounded ${
        isMatched
          ? 'text-primary bg-orange-400/40'
          : isActive
            ? 'bg-brand/20 text-brand dark:bg-primary/20 dark:text-primary'
            : 'hover:bg-primary/10'
      }`}
    >
      {word.word}
    </button>
  );
}

// Inline-highlight treatments applied when a reference pill is being
// hovered. The color↔kind mapping (yellow=scripture, sky=keyword) lives
// on the pill itself — the inline span just needs to read as "this
// is the matching text". Light mode draws a translucent colored
// background behind the words. Dark mode brightens to plain white
// instead of a colored text fill: solid yellow/sky text over a dark
// surface read as muddy, and the pill's own color already conveys
// kind.
const BIBLE_HIGHLIGHT_CLASS =
  'bg-yellow-300/30 dark:bg-transparent dark:text-white';
const KEYWORD_HIGHLIGHT_CLASS =
  'bg-sky-400/25 dark:bg-transparent dark:text-white';

// Copy a `<page>#t=<seconds>` deep-link to the clipboard, exposing a transient
// `copied` flag for the icon swap. `navigator.clipboard` rejects on insecure
// contexts (http://) or when denied — silent, since the URL bar still works.
function useCopyTimestampLink(seconds: number) {
  const { copied, copy } = useCopied(1500);
  const copyLink = useCallback(() => {
    const base = window.location.href.split('#')[0] ?? '';
    const seekTo = Math.max(0, Math.round(seconds));
    return copy(`${base}#t=${seekTo}`);
  }, [seconds, copy]);
  return { copied, copy: copyLink };
}

const TIMESTAMP_ACTION_CLASS =
  'shrink-0 cursor-pointer text-primary/40 hover:text-primary/80';

// Inline icon-button shown next to a timestamp/heading on hover — copies the
// deep-link, briefly swapping the link icon for a checkmark. Layout stays stable
// across show/hide via `invisible` (the box keeps its size) + `group-hover:visible`.
function CopyLinkButton({
  seconds,
  className,
}: {
  seconds: number;
  className?: string;
}) {
  const { copied, copy } = useCopyTimestampLink(seconds);
  const label = copied ? 'Link copied' : 'Copy link to timestamp';
  return (
    <LcTooltip
      content={label}
      render={(props) => (
        <button
          {...props}
          type="button"
          onClick={copy}
          aria-label={label}
          className={`${TIMESTAMP_ACTION_CLASS} ${className ?? ''}`}
        >
          {copied ? (
            <IconCheck size={12} aria-hidden="true" />
          ) : (
            <IconLink size={12} aria-hidden="true" />
          )}
        </button>
      )}
    />
  );
}

// When a paragraph has a named speaker, the copy button is replaced by a chevron
// that opens a menu: copy the timestamp link, or jump to a search scoped to that
// speaker. `className` carries the same hover-reveal as CopyLinkButton; the
// chevron stays visible while its menu is open.
function TimestampMenu({
  seconds,
  speakerName,
  className,
}: {
  seconds: number;
  speakerName: string;
  className?: string;
}) {
  const { copied, copy } = useCopyTimestampLink(seconds);
  const [open, setOpen] = useState(false);
  return (
    <LcMenu.Root open={open} onOpenChange={setOpen}>
      <LcMenu.Trigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-label="Timestamp and speaker actions"
            className={`${TIMESTAMP_ACTION_CLASS} ${open ? 'visible' : (className ?? '')}`}
          >
            {copied ? (
              <IconCheck size={12} aria-hidden="true" />
            ) : (
              <IconChevronDown size={12} aria-hidden="true" />
            )}
          </button>
        )}
      />
      <LcMenu.Portal>
        <LcMenu.Positioner sideOffset={6} align="start">
          <LcMenu.Popup>
            <MenuItemButton
              onClick={() => {
                void copy();
                setOpen(false);
              }}
              icon={<IconLink size={14} className="shrink-0" />}
            >
              Copy link to timestamp
            </MenuItemButton>
            <MenuItemRouterLink
              to="/search"
              search={{ q: speakerName, speakers: [speakerName] }}
              icon={<IconSearch size={14} className="shrink-0" />}
            >
              Search for more from {speakerName}
            </MenuItemRouterLink>
          </LcMenu.Popup>
        </LcMenu.Positioner>
      </LcMenu.Portal>
    </LcMenu.Root>
  );
}

// Build a case-insensitive regex from a whitespace-separated query so
// each non-empty term matches as a substring against each word.
// Returns null for empty queries; callers should skip matching in that
// case. Memoized at the TranscriptParagraphs level since the query is
// the same for every paragraph in the same render.
function buildHighlightPattern(query: string | undefined): RegExp | null {
  if (!query) return null;
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (terms.length === 0) return null;
  return new RegExp(`(${terms.join('|')})`, 'i');
}

// Memoized so that, as playback ticks, only the paragraph(s) whose
// activeWordIndex/isActive actually changed re-render — not all of the
// (potentially thousands of) word spans.
const ParagraphView = memo(function ParagraphView({
  paragraph,
  activeWordIndex,
  isActive,
  isFirstParagraph,
  onSeek,
  highlightPattern,
}: {
  paragraph: TranscriptParagraph;
  activeWordIndex: number;
  isActive: boolean;
  // First paragraph in the transcript. Used to suppress the section-
  // break divider that's drawn above every other section-starting
  // paragraph — the very first one has no preceding section to part
  // from.
  isFirstParagraph: boolean;
  onSeek: (start: number) => void;
  highlightPattern: RegExp | null;
}) {
  const { outline, chunks, pills } = useMemo(
    () => indexParagraph(paragraph),
    [paragraph],
  );

  // Which reference pill (if any) the cursor is currently over. Drives
  // the inline highlight across every chunk whose `key` matches —
  // covers the "reference cited twice in one paragraph" case (both
  // spans light up together) as well as the common single-span case.
  const [hoveredPillKey, setHoveredPillKey] = useState<string | null>(null);

  // Set of word indices that match the active search query (paragraph-
  // search results render with this populated; the normal transcript
  // view passes a null pattern so the set is empty).
  const matchSet = useMemo(() => {
    const set = new Set<number>();
    if (!highlightPattern) return set;
    for (let i = 0; i < paragraph.words.length; i++) {
      const w = paragraph.words[i];
      if (w && highlightPattern.test(w.word)) set.add(i);
    }
    return set;
  }, [paragraph.words, highlightPattern]);

  // OUTLINE title: stored as `metadata.title`. Defensive in case a
  // future variant of the metadata shape lands without it.
  const outlineTitle =
    outline && typeof outline.metadata.title === 'string'
      ? outline.metadata.title
      : null;

  return (
    <>
      {/* Section break between OUTLINE-bearing paragraphs after the
          first. Spans both grid columns so it visually divides the
          two adjacent sections rather than just the body column. */}
      {outlineTitle && !isFirstParagraph ? (
        <div
          aria-hidden="true"
          className="col-span-2 mt-4 border-t border-zinc-200 dark:border-zinc-800"
        />
      ) : null}
      {/* Single row per paragraph. Column 1 holds the timestamp (and
          a hover-revealed copy-link icon); column 2 holds the optional
          OUTLINE heading stacked above the body words, then a pill
          rail under the body when this paragraph has any scripture/
          keyword annotations. */}
      <div className="group col-span-2 grid grid-cols-subgrid">
        <div className="flex items-center justify-end gap-1 self-start pt-1">
          {paragraph.speakerName ? (
            <TimestampMenu
              seconds={paragraph.start}
              speakerName={paragraph.speakerName}
              className="invisible group-hover:visible"
            />
          ) : (
            <CopyLinkButton
              seconds={paragraph.start}
              className="invisible group-hover:visible"
            />
          )}
          <button
            type="button"
            data-p={paragraph.order}
            onClick={() => onSeek(paragraph.start)}
            className={`cursor-pointer text-right text-[10px] leading-[1.4] tracking-[-0.2px] tabular-nums ${
              isActive
                ? 'text-brand dark:text-primary'
                : 'text-primary/50 hover:text-primary/70'
            }`}
          >
            {formatTime(paragraph.start * 1000)}
          </button>
        </div>
        <div>
          {outlineTitle ? (
            // Heading sits inline with the timestamp (both anchored to
            // the top of the row), then the body wraps below. The
            // heading is still a seek button — clicking it jumps to the
            // section's start the same as clicking the timestamp.
            <h3 className="mb-1">
              <button
                type="button"
                onClick={() => onSeek(paragraph.start)}
                className="text-primary hover:text-primary/80 cursor-pointer text-left text-base font-semibold"
              >
                {outlineTitle}
              </button>
            </h3>
          ) : null}
          <p
            className={`text-sm leading-[1.6] transition-colors ${
              isActive ? 'text-primary' : 'text-primary/60'
            }`}
          >
            {chunks.map((chunk) => {
              const chunkWords = paragraph.words.slice(
                chunk.startIdx,
                chunk.endIdx,
              );

              // Group consecutive hyphen-split tokens (e.g. "co" + "-labor")
              // into a single run. Each group renders with no internal space
              // and `whitespace-nowrap`, so the rejoined word shows as
              // "co-labor" and never breaks across lines (not at the seam,
              // nor at its own hyphen). Single-word groups are the norm.
              const groups: Array<{
                offset: number;
                words: typeof chunkWords;
              }> = [];
              chunkWords.forEach((w, i) => {
                const gluedToPrev =
                  i > 0 &&
                  wordsJoinWithoutSpace(chunkWords[i - 1]?.word ?? '', w.word);
                if (gluedToPrev && groups.length > 0) {
                  groups[groups.length - 1]?.words.push(w);
                } else {
                  groups.push({ offset: i, words: [w] });
                }
              });

              const wordButtons = groups.map((group) => {
                const buttons = group.words.map((w, gi) => {
                  const wordIdx = chunk.startIdx + group.offset + gi;
                  return (
                    <WordButton
                      key={`${wordIdx}-${w.start}`}
                      word={w}
                      isActive={wordIdx === activeWordIndex}
                      isMatched={matchSet.has(wordIdx)}
                      onSeek={onSeek}
                    />
                  );
                });
                // Trailing space separates this group from the next word.
                return (
                  <Fragment
                    key={`${chunk.startIdx + group.offset}-${group.words[0]?.start}`}
                  >
                    {group.words.length > 1 ? (
                      <span className="whitespace-nowrap">{buttons}</span>
                    ) : (
                      buttons
                    )}{' '}
                  </Fragment>
                );
              });

              if (chunk.annotation === null) {
                return (
                  <Fragment key={`${chunk.startIdx}-plain`}>
                    {wordButtons}
                  </Fragment>
                );
              }

              // Inline highlight is now hover-driven — applied only when
              // the matching pill below is being pointed at. Idle state
              // is plain text, which keeps long passages with dense
              // annotation from looking visually shouted at.
              const isHovered =
                chunk.key !== null && chunk.key === hoveredPillKey;
              const highlightClass =
                chunk.annotation.kind === 'BIBLE'
                  ? BIBLE_HIGHLIGHT_CLASS
                  : KEYWORD_HIGHLIGHT_CLASS;
              return (
                <Fragment key={`${chunk.startIdx}-${chunk.key}`}>
                  <span
                    className={`rounded-sm px-0.5 transition-colors ${
                      isHovered ? highlightClass : ''
                    }`}
                  >
                    {wordButtons}
                  </span>
                </Fragment>
              );
            })}
          </p>
          {pills.length > 0 ? (
            // Reference rail. One pill per unique annotation in this
            // paragraph. Hovering a pill highlights every chunk that
            // shares its key in the body above; clicking opens the
            // canonical destination (Let’s Bible for scripture, site
            // search for keywords).
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pills.map((pill) =>
                pill.kind === 'BIBLE' ? (
                  <a
                    key={pill.key}
                    href={pill.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${pill.ref} on Let’s Bible (opens in a new tab)`}
                    onMouseEnter={() => setHoveredPillKey(pill.key)}
                    onMouseLeave={() => setHoveredPillKey(null)}
                    onFocus={() => setHoveredPillKey(pill.key)}
                    onBlur={() => setHoveredPillKey(null)}
                    className="bg-primary/5 text-primary/70 hover:bg-primary/10 hover:text-primary dark:bg-primary/10 dark:hover:bg-primary/20 inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-xs"
                  >
                    <IconBible size={12} aria-hidden="true" />
                    {pill.ref}
                    <IconExternalLink
                      size={12}
                      aria-hidden="true"
                      className="opacity-60"
                    />
                  </a>
                ) : (
                  <Link
                    key={pill.key}
                    to="/search"
                    search={{ q: pill.text }}
                    aria-label={`Search "${pill.text}"`}
                    onMouseEnter={() => setHoveredPillKey(pill.key)}
                    onMouseLeave={() => setHoveredPillKey(null)}
                    onFocus={() => setHoveredPillKey(pill.key)}
                    onBlur={() => setHoveredPillKey(null)}
                    className="bg-primary/5 text-primary/70 hover:bg-primary/10 hover:text-primary dark:bg-primary/10 dark:hover:bg-primary/20 inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-xs"
                  >
                    <IconSearch size={12} aria-hidden="true" />
                    {pill.text}
                  </Link>
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
});

export function TranscriptParagraphs({
  paragraphs,
  isTranscriptProcessing = false,
  highlightQuery,
}: Props) {
  const currentTime = useStore($currentTime);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pattern is the same for every paragraph in this render — build once.
  const highlightPattern = useMemo(
    () => buildHighlightPattern(highlightQuery),
    [highlightQuery],
  );

  // Flattened word starts (seconds) for binary search; each maps back to its
  // paragraph + word position.
  const flat = useMemo(() => {
    const arr: Array<{
      start: number;
      paragraphIndex: number;
      wordIndex: number;
    }> = [];
    paragraphs.forEach((p, pi) => {
      p.words.forEach((w, wi) => {
        arr.push({ start: w.start, paragraphIndex: pi, wordIndex: wi });
      });
    });
    return arr;
  }, [paragraphs]);

  const active = useMemo(() => {
    if (flat.length === 0) return { paragraphIndex: -1, wordIndex: -1 };
    // currentTime is in seconds (NOT ms — the legacy VTT path divides by 1000).
    let i = bSearch(flat, currentTime, (w, ct) => w.start - ct);
    if (i < 0) i = -i - 2; // last word whose start <= currentTime
    if (i < 0) return { paragraphIndex: -1, wordIndex: -1 };
    return {
      paragraphIndex: flat[i]?.paragraphIndex ?? -1,
      wordIndex: flat[i]?.wordIndex ?? -1,
    };
  }, [flat, currentTime]);

  // Auto-scroll the active paragraph into view when it changes.
  // Skipped in search mode (`highlightPattern` set) — the user is
  // browsing a filtered match list and an unrelated playback-driven
  // scroll would yank the list out from under them.
  useEffect(() => {
    if (highlightPattern) return;
    if (active.paragraphIndex < 0 || !containerRef.current) return;
    const order = paragraphs[active.paragraphIndex]?.order;
    const target = containerRef.current.querySelector(`[data-p="${order}"]`);
    if (target) scrollToCenterWithin(containerRef.current, target);
  }, [active.paragraphIndex, paragraphs, highlightPattern]);

  const handleSeek = useCallback((start: number) => {
    $setPlayAt.set(start);
  }, []);

  if (isTranscriptProcessing || paragraphs.length === 0) {
    return (
      <div className="flex size-full items-center justify-center p-5">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          {isTranscriptProcessing ? (
            <>
              <div className="border-t-brand dark:border-t-brand size-10 animate-spin rounded-full border-4 border-zinc-200 dark:border-zinc-800" />
              <div className="flex flex-col gap-2">
                <p className="text-primary text-sm font-medium">
                  Transcript Processing
                </p>
                <p className="text-secondary text-xs">
                  The transcript for this media is currently being generated.
                  Check back soon.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-primary text-sm font-medium">
                No Transcript Available
              </p>
              <p className="text-secondary text-xs">
                A transcript has not been generated for this media.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <LcTooltip.Provider>
      <div
        ref={containerRef}
        className="size-full overflow-auto py-5 pr-5 pl-2"
      >
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3">
          {paragraphs.map((p, pi) => (
            <ParagraphView
              key={p.order}
              paragraph={p}
              activeWordIndex={
                pi === active.paragraphIndex ? active.wordIndex : -1
              }
              isActive={pi === active.paragraphIndex}
              isFirstParagraph={pi === 0}
              onSeek={handleSeek}
              highlightPattern={highlightPattern}
            />
          ))}
        </div>
      </div>
    </LcTooltip.Provider>
  );
}
