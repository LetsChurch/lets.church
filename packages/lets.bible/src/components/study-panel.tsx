import { Drawer } from '@base-ui/react/drawer';
import { Tabs } from '@base-ui/react/tabs';
import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { findBook } from '@/lib/canon';
import { HIGHLIGHT_COLORS, highlightDotStyle } from '@/lib/highlight-colors';
import { decodeMorph } from '@/lib/morph';
import { chapterLink, parseReference } from '@/lib/reference';
import {
  type StudyTab,
  setCommentaryWork,
  setStudyTab,
  useCommentaryWork,
  useStudyTab,
} from '@/lib/study-session';
import { useIsDesktop } from '@/lib/use-media-query';
import {
  commentaryWorksQueryOptions,
  downloadWork,
  removeWork,
  useOfflineCommentaries,
  verseCommentariesQueryOptions,
} from '@/local/offline-commentaries';
import {
  noteOf,
  removeHighlight,
  removeNote,
  setHighlight,
  setNote,
} from '@/local/store';
import { useTRPC } from '@/trpc/react';

import {
  type CrossRef,
  FootnoteSegments,
  overlaysInVerse,
  type WordRef,
} from './passage/passage';
import type { Footnote, Run } from './passage/types';

// What the reader currently has selected. Verses stack (you can select several
// at once — the panel shows a section per verse), while word study stays
// single (one Strong's word at a time). The two are mutually exclusive, so a
// discriminated union models the whole selection — the study panel renders the
// matching view and a word still knows its verse for context.
export type StudySelection =
  | { kind: 'verse'; verses: number[] }
  | { kind: 'word'; word: WordRef };

const NOTE_MAX = 10000;

// Everything the panel needs to render one verse's study section. The reader
// supplies one of these per selected verse; the panel stacks them.
export type VersePanelData = {
  verse: number;
  verseText: string; // text of the verse
  verseRuns: Run[]; // runs of the verse (for clickable words)
  verseFootnotes: { label: string; note: Footnote }[]; // footnotes (a,b,c)
  verseCrossRefs: CrossRef[]; // cross-references
  color: string | null; // highlight color
  hasNote: boolean; // has a note
};

type StudyPanelProps = {
  selection: StudySelection | null;
  translation: string;
  book: string; // slug
  bookName: string;
  chapter: number;
  // Verse selection: one entry per selected verse, stacked in the panel. Empty
  // for a word selection.
  verses: VersePanelData[];
  // Word selection: the text of the word's verse, shown as context.
  wordVerseText: string;
  onClose: () => void;
  onSelectVerse: (verse: number) => void; // switch context to a single verse
  onSelectWord: (word: WordRef) => void; // open a word's study (Strong's)
  onStudyFirstWord: (verse: number) => void; // open a verse's first studyable word
  onRemoveVerse: (verse: number) => void; // drop one verse from the stack
};

// The verse/word view switch — shared by the desktop rail and the mobile drawer.
function StudyPanelInner({
  selection,
  translation,
  book,
  bookName,
  chapter,
  verses,
  wordVerseText,
  onClose,
  onSelectVerse,
  onSelectWord,
  onStudyFirstWord,
  onRemoveVerse,
}: StudyPanelProps & { selection: StudySelection }) {
  if (selection.kind === 'word') {
    const { word } = selection;
    return (
      <WordView
        word={word}
        reference={`${bookName} ${chapter}:${word.verse}`}
        verseText={wordVerseText}
        translation={translation}
        book={book}
        chapter={chapter}
        onClose={onClose}
        onBackToVerse={() => onSelectVerse(word.verse)}
      />
    );
  }
  // Verse selection — stack a section per selected verse, the whole panel
  // scrolling as one. Each section's close removes just that verse; removing the
  // last one empties the selection and closes the panel.
  return (
    <div className="divide-line flex min-h-0 flex-1 flex-col divide-y-4 overflow-y-auto">
      {verses.map((vd) => (
        <VerseView
          key={vd.verse}
          book={book}
          chapter={chapter}
          verse={vd.verse}
          reference={`${bookName} ${chapter}:${vd.verse}`}
          verseText={vd.verseText}
          verseRuns={vd.verseRuns}
          verseFootnotes={vd.verseFootnotes}
          verseCrossRefs={vd.verseCrossRefs}
          color={vd.color}
          hasNote={vd.hasNote}
          onClose={() => onRemoveVerse(vd.verse)}
          onSelectWord={onSelectWord}
          onStudyFirstWord={() => onStudyFirstWord(vd.verse)}
        />
      ))}
    </div>
  );
}

// Mobile bottom-sheet snap points (fractions of the viewport height): the sheet
// rests at ~a third of the screen so it doesn't grow as more verses are selected
// (content scrolls / peeks instead), and the reader can drag it up to full height
// to read comfortably. Module-scope so the array identity is stable across
// renders.
const MOBILE_SNAP_POINTS = [0.34, 1];
const MOBILE_DEFAULT_SNAP_POINT = 0.34;

// The single contextual study panel, built on the **Base UI Drawer**:
//   • Desktop (≥ lg): a non-modal side drawer fixed under the header on the right
//     (swipe-right to dismiss). Non-modal + `disablePointerDismissal`, so it
//     overlays the page without shifting the reading — clicking the text to
//     select another verse/word keeps the panel open and just updates it.
//   • Mobile (< lg): a non-modal bottom sheet (swipe-down to dismiss, no
//     backdrop — the text stays visible and tappable so verses keep stacking).
//     The panel renders verse actions for the selected verse(s), or the
//     Greek/Hebrew lexicon for a selected word (with its verse as context).
export function StudyPanel(
  props: StudyPanelProps & { belowControls?: boolean },
) {
  const { belowControls, ...inner } = props;
  const { selection, onClose } = inner;
  const isDesktop = useIsDesktop();
  const ariaLabel = selection?.kind === 'word' ? 'Word study' : 'Verse actions';
  const body = selection ? (
    <StudyPanelInner {...inner} selection={selection} />
  ) : null;

  if (isDesktop) {
    return (
      <Drawer.Root
        open={selection != null}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        swipeDirection="right"
        modal={false}
        disablePointerDismissal
      >
        <Drawer.Portal>
          <Drawer.Viewport
            className={`pointer-events-none fixed right-0 bottom-0 left-0 z-50 flex items-stretch justify-end ${
              belowControls ? 'top-30' : 'top-15'
            }`}
          >
            <Drawer.Popup
              aria-label={ariaLabel}
              data-drawer
              className="border-line-strong bg-paper-raised pointer-events-auto flex h-full w-[340px] [transform:translateX(var(--drawer-swipe-movement-x))] flex-col border-l shadow-[-18px_0_40px_-28px_rgba(40,34,18,0.4)] transition-transform duration-300 ease-out outline-none data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full data-[swiping]:duration-0"
            >
              {body}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Drawer.Root
      open={selection != null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      swipeDirection="down"
      modal={false}
      disablePointerDismissal
      snapPoints={MOBILE_SNAP_POINTS}
      defaultSnapPoint={MOBILE_DEFAULT_SNAP_POINT}
    >
      <Drawer.Portal>
        {/* No backdrop: the bottom sheet floats over the reading without dimming
            or covering the text, so verses stay visible and tappable while the
            panel is open (mirrors the non-modal desktop rail). Non-modal +
            disablePointerDismissal so tapping another verse in the text stacks it
            into the panel instead of dismissing the sheet. */}
        <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center">
          {/* Rests at the ~34dvh snap point (see MOBILE_SNAP_POINTS) so the sheet
              doesn't grow as verses are added — content scrolls/peeks and the
              reader drags up to expand. The transform composes the snap offset
              with the live swipe movement (Base UI's documented pattern for a
              down-swiping snap drawer). */}
          <Drawer.Popup
            aria-label={ariaLabel}
            data-drawer
            className="border-line-strong bg-paper-raised pointer-events-auto flex max-h-[92dvh] w-full [transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))] flex-col rounded-t-2xl border-t transition-transform duration-300 ease-out outline-none data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full data-[swiping]:duration-0"
          >
            <div className="flex flex-shrink-0 cursor-grab justify-center pt-2.5 pb-1 active:cursor-grabbing">
              <div className="bg-line-strong h-1.5 w-10 rounded-full" />
            </div>
            {body}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function PanelHeader({
  eyebrow,
  title,
  titleClass,
  onClose,
}: {
  eyebrow: string;
  title: React.ReactNode;
  titleClass?: string;
  onClose: () => void;
}) {
  return (
    <header className="border-line flex items-start justify-between gap-3 border-b px-5 py-4">
      <div>
        <div className="text-gold-soft text-[11px] font-bold tracking-[0.16em] uppercase">
          {eyebrow}
        </div>
        <div
          className={`text-ink-strong mt-1 font-serif leading-tight ${titleClass ?? 'text-[24px]'}`}
        >
          {title}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-muted-2 hover:bg-paper-soft focus-visible:ring-gold/40 -mr-1 flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-[18px] outline-none focus-visible:ring-2"
      >
        <span aria-hidden>×</span>
        <span className="sr-only">Close</span>
      </button>
    </header>
  );
}

// Verse-selected view: the verse text plus the actions that used to live in the
// floating toolbar — highlight, copy, share, compare, and the note editor.
function VerseView({
  book,
  chapter,
  verse,
  reference,
  verseText,
  verseRuns,
  verseFootnotes,
  verseCrossRefs,
  color,
  hasNote,
  onClose,
  onSelectWord,
  onStudyFirstWord,
}: {
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  verseText: string;
  verseRuns: Run[];
  verseFootnotes: { label: string; note: Footnote }[];
  verseCrossRefs: CrossRef[];
  color: string | null;
  hasNote: boolean;
  onClose: () => void;
  onSelectWord: (word: WordRef) => void;
  onStudyFirstWord: () => void;
}) {
  const navigate = useNavigate();
  const [editingNote, setEditingNote] = useState(false);
  const [copied, setCopied] = useState<'text' | 'link' | null>(null);

  async function copy(kind: 'text' | 'link') {
    const payload =
      kind === 'text'
        ? `${verseText} (${reference})`
        : `${window.location.origin}/bible/${book}/${chapter}?v=${verse}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard blocked — ignore
    }
  }

  const action =
    'rounded-lg border border-line-strong px-3 py-[7px] font-semibold text-[12.5px] text-muted-2 hover:bg-paper-soft hover:text-gold';

  const tab = useStudyTab();
  const tabClass =
    'relative cursor-pointer pt-1 pb-2.5 font-semibold text-[11px] text-muted-2 uppercase tracking-[0.12em] outline-none hover:text-ink data-selected:text-gold';

  return (
    // Auto-height section (the panel body scrolls as a whole so several selected
    // verses can stack) rather than a full-height flex view.
    <section className="flex flex-col">
      <PanelHeader eyebrow="Verse" title={reference} onClose={onClose} />
      <Tabs.Root
        value={tab}
        onValueChange={(value) => setStudyTab(value as StudyTab)}
        className="flex flex-col"
      >
        <Tabs.List className="border-line relative flex gap-5 border-b px-5">
          <Tabs.Tab value="verse" className={tabClass}>
            Verse
          </Tabs.Tab>
          <Tabs.Tab value="commentaries" className={tabClass}>
            Commentaries
          </Tabs.Tab>
          <Tabs.Tab value="media" className={tabClass}>
            Media
          </Tabs.Tab>
          <Tabs.Indicator
            className="bg-gold absolute bottom-0 h-0.5 rounded-t-sm transition-all duration-200"
            style={{
              left: 'var(--active-tab-left)',
              width: 'var(--active-tab-width)',
            }}
          />
        </Tabs.List>

        <Tabs.Panel value="verse" className="px-5 py-5">
          <VerseWords
            runs={verseRuns}
            verse={verse}
            verseText={verseText}
            onSelectWord={onSelectWord}
          />

          <div className="border-line mt-5 border-t pt-4">
            <div className="text-gold-soft mb-2 text-[11px] font-semibold tracking-[0.12em] uppercase">
              Highlight
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Highlight ${c}`}
                  onClick={() => setHighlight(book, chapter, verse, c)}
                  style={highlightDotStyle(c)}
                  className={`size-[22px] rounded-full ${
                    color === c
                      ? 'ring-gold ring-offset-paper-raised ring-2 ring-offset-2'
                      : 'ring-line-strong hover:ring-gold-soft ring-1'
                  }`}
                />
              ))}
              {color ? (
                <button
                  type="button"
                  onClick={() => removeHighlight(book, chapter, verse)}
                  className="text-muted-2 hover:text-gold ml-1 text-[12px] font-semibold"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="border-line mt-5 flex flex-wrap gap-1.5 border-t pt-4">
            <button
              type="button"
              className={action}
              onClick={() => copy('text')}
            >
              {copied === 'text' ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className={action}
              onClick={() => copy('link')}
            >
              {copied === 'link' ? 'Link copied' : 'Share'}
            </button>
            <button
              type="button"
              className={action}
              onClick={() =>
                navigate({
                  to: '/compare/$book/$chapter',
                  params: { book, chapter: String(chapter) },
                  search: { v: verse },
                })
              }
            >
              Compare
            </button>
            <button
              type="button"
              className={`${action} ${hasNote || editingNote ? 'text-gold' : ''}`}
              onClick={() => setEditingNote((open) => !open)}
            >
              {hasNote ? 'Edit note' : 'Add note'}
            </button>
          </div>

          {editingNote ? (
            <NoteEditor
              book={book}
              chapter={chapter}
              verse={verse}
              label={reference}
              hasNote={hasNote}
              onClose={() => setEditingNote(false)}
            />
          ) : null}

          <VerseAnnotations
            verseRuns={verseRuns}
            verseFootnotes={verseFootnotes}
            verseCrossRefs={verseCrossRefs}
          />

          <button
            type="button"
            onClick={onStudyFirstWord}
            className="border-gold-soft/50 text-gold hover:bg-gold/5 mt-6 w-full rounded-lg border px-3 py-2 text-[12.5px] font-semibold"
          >
            Study a word — or tap any word in the verse
          </button>
        </Tabs.Panel>

        <Tabs.Panel value="commentaries" className="px-5 py-5">
          <CommentariesTab
            book={book}
            chapter={chapter}
            verse={verse}
            reference={reference}
          />
        </Tabs.Panel>

        <Tabs.Panel value="media" className="px-5 py-5">
          <RelatedMediaTab
            book={book}
            chapter={chapter}
            verse={verse}
            reference={reference}
          />
        </Tabs.Panel>
      </Tabs.Root>
    </section>
  );
}

// A labeled section in the verse view (gold-soft eyebrow + content), shown only
// when it has content.
function AnnotationSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-line mt-5 border-t pt-4">
      <div className="text-gold-soft mb-2 text-[11px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

// Renders a plain-text commentary body (blank-line paragraph breaks). Text is
// rendered as JSX children, so React escapes it — the body is plain text with no
// markup. `whitespace-pre-line` keeps intra-paragraph newlines (e.g. quoted
// verse lines in Matthew Henry).
// Resolve a commentary ref-marker target to a reader link. Targets are either an
// OSIS ref (Book.Ch.Vs, from OSIS modules) or a human ref (from GBF <scripRef>).
// Returns null when the book/chapter can't be resolved (rendered as plain text).
function refLink(target: string) {
  // Ranges ("John.3.1-John.3.21", "Ge 1:1-10") link to the first verse.
  const base = target.split(/[-–]/)[0].trim();
  const osis = /^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?$/.exec(base);
  if (osis) {
    const book = findBook(osis[1]);
    const chapter = Number(osis[2]);
    if (book && chapter >= 1 && chapter <= book.chapterCount) {
      return chapterLink(
        book.slug,
        chapter,
        osis[3] ? Number(osis[3]) : undefined,
      );
    }
  }
  const parsed = parseReference(base);
  return parsed ? chapterLink(parsed.book, parsed.chapter, parsed.verse) : null;
}

// Plain-text preview for the list (strip ref-markers down to their display text).
function stripRefMarkers(body: string): string {
  return body.replace(/\{\{ref:[^|]*\|([^}]*)\}\}/g, '$1');
}

const REF_MARKER = /\{\{ref:([^|]*)\|([^}]*)\}\}/g;

// Render a commentary paragraph, turning {{ref:target|display}} markers into
// reader links (unresolvable targets fall back to plain text). React escapes
// every text/link child, so this is safe for the untrusted commentary text.
function renderParagraph(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  REF_MARKER.lastIndex = 0;
  let m = REF_MARKER.exec(text);
  while (m !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const link = refLink(m[1]);
    out.push(
      link ? (
        <Link key={`r${key++}`} {...link} className="text-gold hover:underline">
          {m[2]}
        </Link>
      ) : (
        m[2]
      ),
    );
    last = REF_MARKER.lastIndex;
    m = REF_MARKER.exec(text);
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function CommentaryBody({ body }: { body: string }) {
  return (
    <div className="text-ink space-y-2 text-[13px] leading-relaxed">
      {body.split('\n\n').map((p, i) => (
        <p key={`p${i}`} className="whitespace-pre-line">
          {renderParagraph(p)}
        </p>
      ))}
    </div>
  );
}

// A compact per-commentary offline control (download / progress / downloaded),
// the panel-side counterpart to the Library's Download/Remove buttons. Reuses the
// offline-commentaries store, so its state stays in sync with the Library.
function CommentaryDownloadButton({
  workId,
  className = '',
}: {
  workId: string;
  className?: string;
}) {
  const status = useOfflineCommentaries()[workId] ?? { state: 'idle' as const };
  if (status.state === 'downloading') {
    return (
      <span
        className={`text-muted-2 flex-shrink-0 px-1 text-[11px] font-semibold tabular-nums ${className}`}
        title="Downloading for offline…"
      >
        {Math.round((status.progress ?? 0) * 100)}%
      </span>
    );
  }
  const downloaded = status.state === 'downloaded';
  return (
    <button
      type="button"
      aria-label={
        downloaded ? 'Remove offline download' : 'Download for offline reading'
      }
      title={
        downloaded
          ? 'Saved for offline — tap to remove'
          : 'Download for offline reading'
      }
      onClick={() => (downloaded ? removeWork(workId) : downloadWork(workId))}
      className={`flex size-7 flex-shrink-0 items-center justify-center rounded-md ${
        downloaded
          ? 'text-gold'
          : 'text-muted-2 hover:bg-paper-soft hover:text-gold'
      } ${className}`}
    >
      <svg viewBox="0 0 14 14" aria-hidden="true" className="size-3.5">
        {downloaded ? (
          <path
            d="M2.5 7.5 6 11l5.5-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M7 1.5v7m0 0 2.5-2.5M7 8.5 4.5 6M2 11.5h10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}

// The Commentaries tab: a master/detail navigator over the public-domain works.
// The list shows the works that comment on the current verse; picking one opens
// its note and **follows that work** — the choice persists in the session store,
// so moving to the next verse keeps showing the same commentator (with a back
// link to the list). Fetched on demand per verse (bodies are large, so unlike
// cross-references they're not prefetched).
function CommentariesTab({
  book,
  chapter,
  verse,
  reference,
}: {
  book: string;
  chapter: number;
  verse: number;
  reference: string;
}) {
  const trpc = useTRPC();
  // Offline-aware: online hits the server; when offline these fall back to the
  // downloaded copy (downloaded works only). See local/offline-commentaries.
  const { data: works } = useQuery(commentaryWorksQueryOptions(trpc));
  const { data: entries, isLoading } = useQuery(
    verseCommentariesQueryOptions(trpc, { book, chapter, verse }),
  );
  const followingId = useCommentaryWork();

  if (isLoading || !works || !entries) {
    return <p className="text-muted-2 text-[13px]">Loading commentaries…</p>;
  }

  const entryByWork = new Map(entries.map((e) => [e.workId, e]));
  // Works that comment on this verse, in display order — drives the list and the
  // prev/next cycle so navigation never lands on a dead end for this verse.
  const here = works.filter((w) => entryByWork.has(w.id));
  const following = followingId
    ? works.find((w) => w.id === followingId)
    : undefined;

  // Detail view — a work is being followed.
  if (following) {
    const entry = entryByWork.get(following.id);
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCommentaryWork(null)}
            className="text-gold text-[12px] font-semibold hover:underline"
          >
            ‹ All commentaries
          </button>
          <CommentaryDownloadButton workId={following.id} />
        </div>

        <div className="mt-3">
          <div className="text-ink-strong font-serif text-[18px] leading-tight">
            {following.name}
          </div>
          <div className="text-muted-2 mt-0.5 text-[12px]">
            {following.author}
            {following.year ? ` · ${following.year}` : ''}
            {following.tradition ? ` · ${following.tradition}` : ''}
          </div>
          {entry?.verseEnd ? (
            <div className="text-gold-soft mt-0.5 text-[11px]">
              on vv. {entry.verse}–{entry.verseEnd}
            </div>
          ) : null}
        </div>

        {entry ? (
          <>
            <div className="mt-4">
              <CommentaryBody body={entry.body} />
            </div>
            {following.sourceUrl ? (
              <a
                href={following.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-gold mt-3 inline-block text-[12px] font-semibold hover:underline"
              >
                Source
              </a>
            ) : null}
          </>
        ) : (
          <p className="text-muted mt-4 text-[13px] italic">
            {following.author} has no note on {reference}.
            {here.length > 0
              ? ' Use ‹ All commentaries to see what’s available here.'
              : ''}
          </p>
        )}
      </div>
    );
  }

  // List view — choose a commentary for this verse.
  if (here.length === 0) {
    return (
      <p className="text-muted-2 text-[13px]">No commentaries on this verse.</p>
    );
  }
  return (
    // Flush, full-bleed list (the panel supplies the px-5 gutter): rows are
    // separated by hairline dividers rather than boxed in padded cards.
    <div className="divide-line -mx-5 flex flex-col divide-y">
      {here.map((w) => {
        const entry = entryByWork.get(w.id);
        return (
          // Row = a main "open this work" button + a sibling download control
          // (not nested — mirrors the translation picker's row actions).
          <div
            key={w.id}
            className="hover:bg-paper-soft flex items-start gap-2 px-5 py-3"
          >
            <button
              type="button"
              onClick={() => setCommentaryWork(w.id)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="text-ink text-[13px] font-semibold">{w.name}</div>
              <div className="text-muted-2 text-[11.5px]">
                {w.author}
                {w.year ? ` · ${w.year}` : ''}
                {entry?.verseEnd
                  ? ` · on vv. ${entry.verse}–${entry.verseEnd}`
                  : ''}
              </div>
              {entry ? (
                <div className="text-muted mt-1 line-clamp-2 text-[12px] leading-snug">
                  {stripRefMarkers(entry.body)}
                </div>
              ) : null}
            </button>
            {/* Nudge up so the icon shares a baseline with the work heading
                (the row is items-start to top-align with the multi-line text). */}
            <CommentaryDownloadButton workId={w.id} className="-mt-1" />
          </div>
        );
      })}
    </div>
  );
}

// Format a duration in seconds as M:SS / H:MM:SS (web's util/format formatTime
// isn't shared with lets.bible).
function formatDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

// Compact view count: 1234 → "1.2K", 1_200_000 → "1.2M".
function formatViews(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

// Media from the lets.church catalog that teaches this verse. Fetched from
// lets.bible's `bible.relatedMedia` proxy (→ web's internal endpoint), ranked by
// views + recency, each card deep-linked to the timestamp where the verse is
// discussed. The "Search this verse" link goes to the full faceted search.
function RelatedMediaTab({
  book,
  chapter,
  verse,
  reference,
}: {
  book: string;
  chapter: number;
  verse: number;
  reference: string;
}) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.bible.relatedMedia.queryOptions({ book, chapter, verse }),
  );
  // The lets.church origin, for the "Powered by" attribution (same source the
  // site footer uses).
  const { data: authHost } = useQuery(trpc.common.authHost.queryOptions());

  const searchLink =
    data?.searchUrl != null ? (
      <a
        href={data.searchUrl}
        target="_blank"
        rel="noreferrer"
        className="text-gold inline-block text-[12px] font-semibold hover:underline"
      >
        Search {reference} on lets.church →
      </a>
    ) : null;

  // Attribution: this catalog is lets.church's, surfaced here.
  const poweredBy = (
    <p className="text-faint text-[11px]">
      Powered by{' '}
      <a
        href={authHost ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="text-gold-soft font-semibold hover:underline"
      >
        lets.church
      </a>
    </p>
  );

  if (isLoading) {
    return <p className="text-muted-2 text-[13px]">Loading media…</p>;
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-muted-2 text-[13px]">
          No media references this verse yet.
        </p>
        {searchLink}
        {poweredBy}
      </div>
    );
  }

  return (
    <div>
      {/* Flush, full-bleed list — the panel supplies the px-5 gutter. */}
      <div className="divide-line -mx-5 flex flex-col divide-y">
        {items.map((item) => {
          const duration = formatDuration(item.lengthSeconds);
          return (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="hover:bg-paper-soft flex items-start gap-3 px-5 py-3"
            >
              <div className="bg-paper-soft ring-line relative aspect-video w-28 shrink-0 overflow-hidden rounded-md ring-1">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : null}
                {duration ? (
                  <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 py-0.5 font-mono text-[10px] text-white tabular-nums">
                    {duration}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-ink line-clamp-2 text-[13px] leading-snug font-semibold">
                  {item.title ?? 'Untitled'}
                </div>
                <div className="text-muted-2 mt-0.5 text-[11.5px]">
                  {item.channelName ?? 'Unknown'}
                  {` · ${formatViews(item.viewCount)} view${item.viewCount === 1 ? '' : 's'}`}
                </div>
              </div>
            </a>
          );
        })}
      </div>
      <div className="mt-4 space-y-1.5">
        {searchLink}
        {poweredBy}
      </div>
    </div>
  );
}

// The verse's footnotes (with their reading letters), cross-references,
// source-text overlays — surfaced together in the Verse tab. (Commentaries are
// their own tab; see CommentariesTab.)
function VerseAnnotations({
  verseRuns,
  verseFootnotes,
  verseCrossRefs,
}: {
  verseRuns: Run[];
  verseFootnotes: { label: string; note: Footnote }[];
  verseCrossRefs: CrossRef[];
}) {
  const overlays = overlaysInVerse(verseRuns);
  const hasOverlays =
    overlays.divineNames.length > 0 ||
    overlays.hasOtQuote ||
    overlays.hallelujahs.length > 0;

  return (
    <>
      {verseFootnotes.length > 0 ? (
        <AnnotationSection label="Footnotes">
          <ul className="space-y-2">
            {verseFootnotes.map(({ label, note }, i) => (
              <li
                key={`fn${i}`}
                className="text-ink flex gap-2 text-[13.5px] leading-relaxed"
              >
                <span className="text-gold font-semibold italic">{label}</span>
                <span>
                  <FootnoteSegments segments={note.segments} />
                </span>
              </li>
            ))}
          </ul>
        </AnnotationSection>
      ) : null}

      {verseCrossRefs.length > 0 ? (
        <AnnotationSection label="Cross-references">
          <ul className="space-y-1.5">
            {verseCrossRefs.map((x, i) => (
              <li key={`xr${i}`} className="text-[13.5px]">
                <Link
                  {...chapterLink(x.slug, x.chapter, x.verse ?? undefined)}
                  className="text-gold font-semibold hover:underline"
                >
                  {x.label}
                </Link>
              </li>
            ))}
          </ul>
        </AnnotationSection>
      ) : null}

      {hasOverlays ? (
        <AnnotationSection label="Source text">
          <ul className="text-muted space-y-2 text-[13px] leading-relaxed">
            {overlays.divineNames.length > 0 ? (
              <li>
                <span className="text-ink font-semibold">Divine name</span> —
                the LORD renders the Tetragrammaton{' '}
                <span className="font-hebrew" dir="rtl" lang="he">
                  יְהוָה
                </span>{' '}
                (YHWH).
              </li>
            ) : null}
            {overlays.hasOtQuote ? (
              <li>
                <span className="text-ink font-semibold">
                  Old Testament quotation
                </span>{' '}
                — this verse quotes the Old Testament
                {verseCrossRefs.length > 0
                  ? ' (see cross-references above)'
                  : ''}
                .
              </li>
            ) : null}
            {overlays.hallelujahs.length > 0 ? (
              <li>
                <span className="text-ink font-semibold">Hallelujah</span> —
                “Praise Yah”: hallĕlû (praise) + Yah (a short form of YHWH).
              </li>
            ) : null}
          </ul>
        </AnnotationSection>
      ) : null}
    </>
  );
}

// The selected verse's text, with each Strong's-tagged word clickable to open
// its word study (the same affordance as the reading text) — driving the panel's
// hierarchical navigation (verse → word, with a back link in the word view).
function VerseWords({
  runs,
  verse,
  verseText,
  onSelectWord,
}: {
  runs: Run[];
  verse: number;
  verseText: string;
  onSelectWord: (word: WordRef) => void;
}) {
  if (runs.length === 0) {
    // Fallback to the plain joined text if runs aren't available.
    return (
      <p className="text-ink font-serif text-[18px] leading-relaxed">
        {verseText}
      </p>
    );
  }
  return (
    <p className="text-ink font-serif text-[18px] leading-relaxed">
      {runs.map((r, i) => {
        if (r.note) {
          return null;
        }
        if (r.strong && r.position != null) {
          const word: WordRef = {
            verse,
            position: r.position,
            strong: r.strong,
            surface: r.text,
            divineName: r.divineName,
            otQuote: r.otQuote,
          };
          return (
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a span keeps inline text flow; it carries the button role + keyboard handlers
            <span
              key={`w${i}`}
              role="button"
              tabIndex={0}
              className="hover:bg-gold/10 hover:text-gold cursor-pointer rounded-[2px]"
              onClick={() => onSelectWord(word)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectWord(word);
                }
              }}
            >
              {r.text}
            </span>
          );
        }
        return <span key={`w${i}`}>{r.text}</span>;
      })}
    </p>
  );
}

// The verse-note form, built on TanStack Form (validation: non-empty, ≤ NOTE_MAX
// to match the server). Writes go to the local-first store.
function NoteEditor({
  book,
  chapter,
  verse,
  label,
  hasNote,
  onClose,
}: {
  book: string;
  chapter: number;
  verse: number;
  label: string;
  hasNote: boolean;
  onClose: () => void;
}) {
  const form = useForm({
    defaultValues: { body: noteOf(book, chapter, verse) ?? '' },
    onSubmit: ({ value }) => {
      setNote(book, chapter, verse, value.body.trim());
      onClose();
    },
  });

  return (
    <form
      className="mt-3 flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="body"
        validators={{
          // onMount so an empty new note disables Save immediately.
          onMount: ({ value }: { value: string }) =>
            value.trim() ? undefined : 'Note can’t be empty',
          onChange: ({ value }: { value: string }) => {
            const t = value.trim();
            if (!t) {
              return 'Note can’t be empty';
            }
            if (value.length > NOTE_MAX) {
              return `Note is too long (max ${NOTE_MAX})`;
            }
            return undefined;
          },
        }}
      >
        {(field) => (
          <>
            <textarea
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- the note editor is opened intentionally by the user
              autoFocus
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder={`Note on ${label}…`}
              rows={4}
              className="border-line-strong bg-paper-soft text-ink placeholder:text-faint focus:border-gold-soft w-full resize-none rounded-lg border px-2.5 py-2 text-[13px] outline-none"
            />
            {field.state.meta.isTouched && field.state.meta.errors[0] ? (
              <span className="text-redletter px-0.5 text-[11.5px]">
                {String(field.state.meta.errors[0])}
              </span>
            ) : null}
          </>
        )}
      </form.Field>
      <div className="flex items-center justify-end gap-1.5">
        {hasNote ? (
          <button
            type="button"
            onClick={() => {
              removeNote(book, chapter, verse);
              onClose();
            }}
            className="text-redletter hover:bg-paper-soft mr-auto rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
          >
            Delete
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="text-muted-2 hover:bg-paper-soft rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
        >
          Cancel
        </button>
        <form.Subscribe
          selector={(s) => [s.canSubmit, s.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="bg-gold rounded-lg px-3 py-1.5 text-[12px] font-bold text-[#1f1d18] disabled:opacity-50"
            >
              Save
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

// Word-selected view: the lexeme/source/occurrences, with the verse it came from
// shown as context at the top (click to return to the verse view).
function WordView({
  word,
  reference,
  verseText,
  translation,
  book,
  chapter,
  onClose,
  onBackToVerse,
}: {
  word: WordRef;
  reference: string;
  verseText: string;
  translation: string;
  book: string;
  chapter: number;
  onClose: () => void;
  onBackToVerse: () => void;
}) {
  const trpc = useTRPC();
  const { data: lexeme, isLoading } = useQuery(
    trpc.bible.lexeme.queryOptions({ strong: word.strong, translation }),
  );
  const isHebrew = lexeme?.language === 'hebrew';

  return (
    <>
      <PanelHeader
        eyebrow="Word study"
        title={`“${word.surface}”`}
        onClose={onClose}
      />

      {/* verse context — which verse this word is from, click to act on it */}
      <button
        type="button"
        onClick={onBackToVerse}
        className="group border-line hover:bg-paper-soft flex flex-col gap-1 border-b px-5 py-3 text-left"
      >
        <span className="text-gold text-[11px] font-semibold tracking-[0.12em] uppercase group-hover:underline">
          ‹ {reference}
        </span>
        <span className="text-muted-2 line-clamp-2 text-[12.5px] italic">
          {verseText}
        </span>
      </button>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {(() => {
          // Parsing for THIS inflected word — available from the true interlinear
          // (independent of the lexicon load below).
          const parsed = decodeMorph(word.morph, word.language);
          return parsed ? (
            <div className="border-line mb-5 border-b pb-4">
              <div className="text-gold-soft mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
                Parsing
              </div>
              <p className="text-ink text-[14px] leading-relaxed">
                {parsed.label}
              </p>
              <p className="text-muted-2 mt-0.5 font-mono text-[11px]">
                {parsed.raw}
              </p>
            </div>
          ) : null;
        })()}
        {isLoading ? (
          <p className="text-faint text-[13px]">Loading…</p>
        ) : (
          <>
            {lexeme ? (
              <LexemeBody lexeme={lexeme} isHebrew={isHebrew} />
            ) : (
              <p className="text-faint text-[13px]">
                No lexicon entry for{' '}
                <span className="font-mono">{word.strong}</span>.
              </p>
            )}
            <SourceText
              word={word}
              book={book}
              chapter={chapter}
              translation={translation}
            />
            {lexeme ? (
              <Occurrences word={word} translation={translation} />
            ) : null}
          </>
        )}
      </div>

      <footer className="border-line text-faint border-t px-5 py-2.5 text-[11px]">
        Strong’s Exhaustive Concordance (1890), public domain.
      </footer>
    </>
  );
}

function LexemeBody({
  lexeme,
  isHebrew,
}: {
  lexeme: {
    lemma: string;
    strong: string;
    transliteration: string | null;
    pronunciation: string | null;
    gloss: string | null;
    kjvDef: string | null;
    derivation: string | null;
  };
  isHebrew: boolean;
}) {
  return (
    <>
      <div className="flex items-baseline gap-3">
        <span
          className={`text-ink-strong text-[34px] leading-none ${
            isHebrew ? 'font-hebrew' : 'font-serif'
          }`}
          dir={isHebrew ? 'rtl' : 'ltr'}
          lang={isHebrew ? 'he' : 'el'}
        >
          {lexeme.lemma}
        </span>
        <span className="border-line-strong bg-paper-soft text-muted rounded-full border px-2.5 py-[3px] font-mono text-[11px] font-semibold">
          {lexeme.strong}
        </span>
      </div>

      {lexeme.transliteration || lexeme.pronunciation ? (
        <div className="text-muted mt-2 text-[14px] italic">
          {lexeme.transliteration}
          {lexeme.transliteration && lexeme.pronunciation ? ' · ' : ''}
          {lexeme.pronunciation}
        </div>
      ) : null}

      <div className="text-faint mt-1 text-[11px] font-semibold tracking-[0.1em] uppercase">
        {isHebrew ? 'Hebrew' : 'Greek'}
      </div>

      {lexeme.gloss ? (
        <Section label="Definition">{lexeme.gloss}</Section>
      ) : null}
      {lexeme.kjvDef ? (
        <Section label="Translated as">{lexeme.kjvDef}</Section>
      ) : null}
      {lexeme.derivation ? (
        <Section label="Derivation">{lexeme.derivation}</Section>
      ) : null}
    </>
  );
}

// Source-text overlay notes for the selected word: the divine name (YHWH) and
// Old Testament quotations (with links to the source passage where the verse's
// cross-references provide one).
function SourceText({
  word,
  book,
  chapter,
  translation,
}: {
  word: WordRef;
  book: string;
  chapter: number;
  translation: string;
}) {
  if (!word.divineName && !word.otQuote) {
    return null;
  }
  return (
    <div className="border-line mt-5 space-y-4 border-t pt-4">
      {word.divineName ? (
        <Section label="Source text">
          The divine name{' '}
          <span className="font-hebrew" dir="rtl" lang="he">
            יְהוָה
          </span>{' '}
          (YHWH), the Tetragrammaton — traditionally rendered “the LORD”.
        </Section>
      ) : null}
      {word.otQuote ? (
        <OtQuoteSource
          book={book}
          chapter={chapter}
          verse={word.verse}
          translation={translation}
        />
      ) : null}
    </div>
  );
}

function OtQuoteSource({
  book,
  chapter,
  verse,
  translation,
}: {
  book: string;
  chapter: number;
  verse: number;
  translation: string;
}) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.bible.crossReferences.queryOptions({
      book,
      chapter,
      verse,
      translation,
    }),
  );
  return (
    <div>
      <div className="text-gold-soft mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
        Old Testament quotation
      </div>
      {data && data.length > 0 ? (
        <ul className="space-y-1.5">
          {data.map((x, i) => {
            const b = findBook(x.toBook);
            const label = `${b?.name ?? x.toBook} ${x.toChapter}${
              x.toVerse != null
                ? `:${x.toVerse}${x.toVerseEnd ? `-${x.toVerseEnd}` : ''}`
                : ''
            }`;
            return (
              <li key={`${label}-${i}`} className="text-[13.5px]">
                <Link
                  {...chapterLink(
                    x.toBook,
                    x.toChapter,
                    x.toVerse ?? undefined,
                  )}
                  className="text-gold font-semibold hover:underline"
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted text-[13px] leading-relaxed">
          This passage quotes the Old Testament.
        </p>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="text-gold-soft mb-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </div>
      <p className="text-ink text-[14px] leading-relaxed">{children}</p>
    </div>
  );
}

// Concordance: every verse where this Strong's number occurs in the current
// translation. Lazy — only fetched once the reader expands the section.
function Occurrences({
  word,
  translation,
}: {
  word: WordRef;
  translation: string;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    ...trpc.bible.wordOccurrences.queryOptions({
      strong: word.strong,
      translation,
      limit: 50,
    }),
    enabled: open,
  });

  return (
    <div className="border-line mt-5 border-t pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-gold flex w-full items-center justify-between text-[12.5px] font-semibold outline-none focus-visible:underline"
      >
        <span>Other occurrences</span>
        <span className="text-muted-2 text-[11px]">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        isLoading ? (
          <p className="text-faint mt-3 text-[13px]">Loading…</p>
        ) : data && data.length > 0 ? (
          <ul className="mt-3 space-y-2.5">
            {data.map((o, i) => {
              const book = findBook(o.book);
              const label = `${book?.name ?? o.book} ${o.chapter}:${o.verse}`;
              return (
                <li key={`${o.ref}-${i}`} className="text-[13px] leading-snug">
                  {book ? (
                    <Link
                      to="/bible/$book/$chapter"
                      params={{
                        book: book.slug,
                        chapter: String(o.chapter),
                      }}
                      search={{ v: o.verse }}
                      // Verse deep-link: keep scroll, the reader centers the verse.
                      resetScroll={false}
                      className="text-gold font-semibold hover:underline"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="text-muted font-semibold">{label}</span>
                  )}
                  {o.count > 1 ? (
                    <span className="text-gold-soft ml-1 text-[11px] font-semibold">
                      ×{o.count}
                    </span>
                  ) : null}{' '}
                  <span className="text-muted-2">{o.text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-faint mt-3 text-[13px]">No other occurrences.</p>
        )
      ) : null}
    </div>
  );
}
