import { useStore } from '@nanostores/react';
import { IconExternalLink, IconSearch } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import bSearch from 'binary-search';
import { Fragment, memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { LcTooltip } from '@/components/lc-tooltip';
import { $currentTime, $setPlayAt } from '@/stores/player';
import {
  buildBibleHubUrl,
  formatBibleRef,
  parseBibleMetadata,
} from '@/util/bible-url';
import { formatTime } from '@/util/format';

// Strip leading/trailing punctuation from a word, preserving inner
// apostrophes ("can't" → "can't"). Mirrors the backend's `normalizeWord`
// in annotate-transcript.ts, minus the lowercasing — search queries
// preserve case so brand names / proper nouns match downstream.
function stripWordPunctuation(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '');
}

export type TranscriptWord = { word: string; start: number; end: number };

export type TranscriptAnnotation = {
  kind: 'OUTLINE' | 'BIBLE' | 'KEYWORD';
  startWord: number | null;
  endWord: number | null;
  // biome-ignore lint/complexity/noBannedTypes: matches the JSON-safe shape from `getTranscriptParagraphs` (see comment in `trpc/procedures/media.ts`).
  metadata: { [key: string]: {} };
};

export type TranscriptParagraph = {
  order: number;
  start: number;
  end: number;
  speaker: string | null;
  text: string;
  words: Array<TranscriptWord>;
  annotations: Array<TranscriptAnnotation>;
};

type Props = {
  paragraphs: Array<TranscriptParagraph>;
  isTranscriptProcessing?: boolean;
};

type WordChunk = {
  annotation: TranscriptAnnotation | null;
  startIdx: number; // inclusive
  endIdx: number; // exclusive
};

// Build a per-word annotation index for the paragraph. Overlap policy: BIBLE
// wins over KEYWORD (scripture refs are higher-signal than generic keyword
// highlights) — BIBLE fills first, KEYWORD only paints empty cells.
// Then collapse consecutive same-reference cells into chunks for rendering.
function indexParagraph(paragraph: TranscriptParagraph) {
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

  // Merge by rendered-content equality, not row identity. The LLM
  // sometimes emits per-word markdown links for one scripture ref
  // (`[John](#bible?...) [3:16](#bible?...)` instead of a single
  // `[John 3:16](#bible?...)`), and the backend writes one annotation
  // row per markdown link. Comparing annotation references would
  // render each word as its own icon; building a canonical key from
  // the known metadata fields collapses adjacent rows that resolve to
  // the same logical link. Canonical (not `JSON.stringify(metadata)`)
  // so the merge is robust to object-key insertion order. KEYWORD
  // metadata is empty today; adjacent KEYWORD rows always merge
  // (the resulting link searches for the joined span, equivalent to
  // a multi-word KEYWORD row).
  const keys = byWord.map((ann) => {
    if (!ann) return null;
    if (ann.kind === 'BIBLE') {
      const m = ann.metadata as {
        book?: unknown;
        chapter?: unknown;
        verse?: unknown;
        endChapter?: unknown;
        endVerse?: unknown;
      };
      return `BIBLE:${m.book ?? ''}:${m.chapter ?? ''}:${m.verse ?? ''}:${m.endChapter ?? ''}:${m.endVerse ?? ''}`;
    }
    return ann.kind;
  });
  const chunks: Array<WordChunk> = [];
  let i = 0;
  while (i < keys.length) {
    const key = keys[i];
    let j = i + 1;
    while (j < keys.length && keys[j] === key) j++;
    chunks.push({
      annotation: byWord[i] ?? null,
      startIdx: i,
      endIdx: j,
    });
    i = j;
  }

  return { outline, chunks };
}

// Render a single word as the existing seek-on-click button. Lifted out so
// both the un-annotated and annotated chunks share the same markup — the
// active-word highlight stays on the inner button regardless of whether
// the chunk is wrapped in an annotation hovercard.
//
// `inAnnotation` suppresses the per-word hover background when the chunk
// is inside an annotation span — the annotation provides its own hover
// treatment at the span level, and per-word hover dots competed with it
// for attention. Click-to-seek stays intact regardless.
function WordButton({
  word,
  isActive,
  onSeek,
  inAnnotation,
}: {
  word: TranscriptWord;
  isActive: boolean;
  onSeek: (start: number) => void;
  inAnnotation: boolean;
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
        isActive
          ? 'bg-brand/20 text-brand dark:bg-primary/20 dark:text-primary'
          : inAnnotation
            ? ''
            : 'hover:bg-primary/10'
      }`}
    >
      {word.word}
    </button>
  );
}

// Color treatments for the inline action icon trailing each annotation
// span. Matches the highlighter hue family so the icon visually belongs
// to its annotation. Darker shade in light mode for contrast against
// white; lighter shade in dark mode matching the swapped text color.
const BIBLE_ICON_CLASS =
  'inline-flex items-center align-middle -translate-y-0.5 text-yellow-700 hover:text-yellow-800 dark:text-yellow-300 dark:hover:text-yellow-200';
const KEYWORD_ICON_CLASS =
  'inline-flex items-center align-middle -translate-y-0.5 text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300';

// Memoized so that, as playback ticks, only the paragraph(s) whose
// activeWordIndex/isActive actually changed re-render — not all of the
// (potentially thousands of) word spans.
const ParagraphView = memo(function ParagraphView({
  paragraph,
  activeWordIndex,
  isActive,
  onSeek,
}: {
  paragraph: TranscriptParagraph;
  activeWordIndex: number;
  isActive: boolean;
  onSeek: (start: number) => void;
}) {
  const { outline, chunks } = useMemo(
    () => indexParagraph(paragraph),
    [paragraph],
  );

  // OUTLINE title: stored as `metadata.title`. Defensive in case a
  // future variant of the metadata shape lands without it.
  const outlineTitle =
    outline && typeof outline.metadata.title === 'string'
      ? outline.metadata.title
      : null;

  return (
    <>
      {outlineTitle ? (
        <h3 className="col-start-2 pt-6 pb-1">
          <button
            type="button"
            onClick={() => onSeek(paragraph.start)}
            className="cursor-pointer text-left font-semibold text-base text-primary hover:text-primary/80"
          >
            {outlineTitle}
          </button>
        </h3>
      ) : null}
      {/* Timestamp (seconds → ms for formatTime); click seeks to the paragraph. */}
      <button
        type="button"
        data-p={paragraph.order}
        onClick={() => onSeek(paragraph.start)}
        className={`self-start pt-1 text-left text-[10px] tabular-nums leading-[1.4] tracking-[-0.2px] ${
          isActive
            ? 'text-brand dark:text-primary'
            : 'text-primary/50 hover:text-primary/70'
        }`}
      >
        {formatTime(paragraph.start * 1000)}
      </button>
      <p
        className={`text-sm leading-[1.6] transition-colors ${
          isActive ? 'text-primary' : 'text-primary/60'
        }`}
      >
        {chunks.map((chunk) => {
          const inAnnotation = chunk.annotation !== null;
          const wordButtons = paragraph.words
            .slice(chunk.startIdx, chunk.endIdx)
            .map((w, i) => {
              const wordIdx = chunk.startIdx + i;
              return (
                <Fragment key={`${wordIdx}-${w.start}`}>
                  <WordButton
                    word={w}
                    isActive={wordIdx === activeWordIndex}
                    onSeek={onSeek}
                    inAnnotation={inAnnotation}
                  />{' '}
                </Fragment>
              );
            });

          if (chunk.annotation === null) {
            return (
              <Fragment key={`${chunk.startIdx}-plain`}>{wordButtons}</Fragment>
            );
          }

          if (chunk.annotation.kind === 'BIBLE') {
            // Defensive: parseBibleMetadata rejects rows with genuinely
            // malformed jsonb. Should never fire — the activity's
            // bibleMetadataSchema (closed OSIS enum) rejects bad
            // metadata at insert time — but keep a silent fallback so
            // an unexpected row can't crash the transcript render.
            const meta = parseBibleMetadata(chunk.annotation.metadata);
            const url = meta ? buildBibleHubUrl(meta) : null;
            if (!meta || !url) {
              return (
                <Fragment key={`${chunk.startIdx}-bible-skip`}>
                  {wordButtons}
                </Fragment>
              );
            }
            const ref = formatBibleRef(meta);
            // Highlighter metaphor — light mode draws a yellow
            // background behind the span (text stays original); dark
            // mode swaps to a solid yellow text color with no
            // background, since translucent yellow over a dark
            // surface reads muddy. `text-decoration` underlines would
            // render only on the inter-word text nodes (UA stylesheet
            // `text-decoration: none` on the child `<button>`s
            // suppresses them under the words), which is why we don't
            // use them. The trailing tooltip icon (a real `<a>`) is
            // the action surface — both keyboard-focusable and
            // middle-clickable for a new tab.
            return (
              <Fragment key={`${chunk.startIdx}-bible`}>
                <span className="rounded-sm bg-yellow-300/30 px-0.5 dark:bg-transparent dark:text-yellow-300">
                  {wordButtons}
                </span>
                <LcTooltip
                  content={`${ref} on BibleHub`}
                  render={
                    // biome-ignore lint/a11y/useAnchorContent: the icon child below becomes the anchor's content at runtime via Tooltip.Trigger's render-pass-through; `aria-label` provides explicit accessible text regardless.
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${ref} on BibleHub`}
                      className={BIBLE_ICON_CLASS}
                    />
                  }
                >
                  <IconExternalLink size={12} aria-hidden="true" />
                </LcTooltip>{' '}
              </Fragment>
            );
          }

          // KEYWORD — search-route link, real <a> under the hood (via
          // TanStack <Link>) so middle-click opens a new tab. Strip
          // leading/trailing punctuation from each word so `q=` is a
          // clean phrase (`"Christ, his death"` would land as
          // `q=Christ%2C%20his%20death`).
          const spanText = paragraph.words
            .slice(chunk.startIdx, chunk.endIdx)
            .map((w) => stripWordPunctuation(w.word))
            .filter((w) => w.length > 0)
            .join(' ');
          return (
            <Fragment key={`${chunk.startIdx}-keyword`}>
              <span className="rounded-sm bg-sky-400/25 px-0.5 dark:bg-transparent dark:text-sky-400">
                {wordButtons}
              </span>
              <LcTooltip
                content={`Search "${spanText}"`}
                render={
                  <Link
                    to="/search"
                    search={{ q: spanText }}
                    aria-label={`Search "${spanText}"`}
                    className={KEYWORD_ICON_CLASS}
                  />
                }
              >
                <IconSearch size={12} aria-hidden="true" />
              </LcTooltip>{' '}
            </Fragment>
          );
        })}
      </p>
    </>
  );
});

export function TranscriptParagraphs({
  paragraphs,
  isTranscriptProcessing = false,
}: Props) {
  const currentTime = useStore($currentTime);
  const containerRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    if (active.paragraphIndex < 0 || !containerRef.current) return;
    const order = paragraphs[active.paragraphIndex]?.order;
    containerRef.current
      .querySelector(`[data-p="${order}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active.paragraphIndex, paragraphs]);

  const handleSeek = useCallback((start: number) => {
    $setPlayAt.set(start);
  }, []);

  if (isTranscriptProcessing || paragraphs.length === 0) {
    return (
      <div className="flex size-full items-center justify-center p-5">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          {isTranscriptProcessing ? (
            <>
              <div className="size-10 animate-spin rounded-full border-4 border-zinc-200 border-t-brand dark:border-zinc-800 dark:border-t-brand" />
              <div className="flex flex-col gap-2">
                <p className="font-medium text-primary text-sm">
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
              <p className="font-medium text-primary text-sm">
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
    <div ref={containerRef} className="size-full overflow-auto p-5">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3">
        {paragraphs.map((p, pi) => (
          <ParagraphView
            key={p.order}
            paragraph={p}
            activeWordIndex={
              pi === active.paragraphIndex ? active.wordIndex : -1
            }
            isActive={pi === active.paragraphIndex}
            onSeek={handleSeek}
          />
        ))}
      </div>
    </div>
  );
}
