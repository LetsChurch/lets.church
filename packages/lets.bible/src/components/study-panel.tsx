import { Drawer } from '@base-ui/react/drawer';
import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { findBook } from '@/lib/canon';
import { HIGHLIGHT_COLORS, highlightDotStyle } from '@/lib/highlight-colors';
import { chapterLink } from '@/lib/reference';
import { useIsDesktop } from '@/lib/use-media-query';
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

// What the reader currently has selected. Verse and word are mutually exclusive,
// so a single discriminated union models the whole selection — the study panel
// renders the matching view and always knows the verse for context.
export type StudySelection =
  | { kind: 'verse'; verse: number }
  | { kind: 'word'; word: WordRef };

const NOTE_MAX = 10000;

type StudyPanelProps = {
  selection: StudySelection | null;
  translation: string;
  book: string; // slug
  bookName: string;
  chapter: number;
  verseText: string; // text of the selection's verse
  verseRuns: Run[]; // runs of the selection's verse (for clickable words)
  verseFootnotes: { label: string; note: Footnote }[]; // verse's footnotes (a,b,c)
  verseCrossRefs: CrossRef[]; // verse's cross-references
  color: string | null; // highlight color of the selection's verse
  hasNote: boolean; // selection's verse has a note
  onClose: () => void;
  onSelectVerse: (verse: number) => void; // switch context to a verse
  onSelectWord: (word: WordRef) => void; // open a word's study (Strong's)
  onStudyFirstWord: () => void; // open the first studyable word of the verse
};

// The verse/word view switch — shared by the desktop rail and the mobile drawer.
function StudyPanelInner({
  selection,
  translation,
  book,
  chapter,
  verseText,
  verseRuns,
  verseFootnotes,
  verseCrossRefs,
  color,
  hasNote,
  onClose,
  onSelectVerse,
  onSelectWord,
  onStudyFirstWord,
  reference,
}: StudyPanelProps & { selection: StudySelection; reference: string }) {
  if (selection.kind === 'word') {
    return (
      <WordView
        word={selection.word}
        reference={reference}
        verseText={verseText}
        translation={translation}
        book={book}
        chapter={chapter}
        onClose={onClose}
        onBackToVerse={() => onSelectVerse(selection.word.verse)}
      />
    );
  }
  return (
    <VerseView
      book={book}
      chapter={chapter}
      verse={selection.verse}
      reference={reference}
      verseText={verseText}
      verseRuns={verseRuns}
      verseFootnotes={verseFootnotes}
      verseCrossRefs={verseCrossRefs}
      color={color}
      hasNote={hasNote}
      onClose={onClose}
      onSelectWord={onSelectWord}
      onStudyFirstWord={onStudyFirstWord}
    />
  );
}

function selectionVerse(selection: StudySelection): number {
  return selection.kind === 'word' ? selection.word.verse : selection.verse;
}

// The single contextual study panel, built on the **Base UI Drawer**:
//   • Desktop (≥ lg): a non-modal side drawer fixed under the header on the right
//     (swipe-right to dismiss). Non-modal + `disablePointerDismissal`, so it
//     overlays the page without shifting the reading — clicking the text to
//     select another verse/word keeps the panel open and just updates it.
//   • Mobile (< lg): a modal bottom sheet (swipe-down to dismiss, dimmed
//     backdrop). The panel renders verse actions for a selected verse, or the
//     Greek/Hebrew lexicon for a selected word (with its verse as context).
export function StudyPanel(
  props: StudyPanelProps & { belowControls?: boolean },
) {
  const { belowControls, ...inner } = props;
  const { selection, onClose } = inner;
  const isDesktop = useIsDesktop();
  const ariaLabel = selection?.kind === 'word' ? 'Word study' : 'Verse actions';
  const reference = selection
    ? `${inner.bookName} ${inner.chapter}:${selectionVerse(selection)}`
    : '';
  const body = selection ? (
    <StudyPanelInner {...inner} selection={selection} reference={reference} />
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
              className="pointer-events-auto flex h-full w-[340px] flex-col border-line-strong border-l bg-paper-raised shadow-[-18px_0_40px_-28px_rgba(40,34,18,0.4)] outline-none transition-transform duration-300 ease-out [transform:translateX(var(--drawer-swipe-movement-x))] data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full data-[swiping]:duration-0"
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
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-ink-strong/40 transition-opacity duration-300 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[swiping]:duration-0" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup
            aria-label={ariaLabel}
            data-drawer
            className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl border-line-strong border-t bg-paper-raised outline-none transition-transform duration-300 ease-out [transform:translateY(var(--drawer-swipe-movement-y))] data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full data-[swiping]:duration-0"
          >
            <div className="flex flex-shrink-0 cursor-grab justify-center pt-2.5 pb-1 active:cursor-grabbing">
              <div className="h-1.5 w-10 rounded-full bg-line-strong" />
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
    <header className="flex items-start justify-between gap-3 border-line border-b px-5 py-4">
      <div>
        <div className="font-bold text-[11px] text-gold-soft uppercase tracking-[0.16em]">
          {eyebrow}
        </div>
        <div
          className={`mt-1 font-serif text-ink-strong leading-tight ${titleClass ?? 'text-[24px]'}`}
        >
          {title}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="-mr-1 flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-[18px] text-muted-2 outline-none hover:bg-paper-soft focus-visible:ring-2 focus-visible:ring-gold/40"
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

  return (
    <>
      <PanelHeader eyebrow="Verse" title={reference} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <VerseWords
          runs={verseRuns}
          verse={verse}
          verseText={verseText}
          onSelectWord={onSelectWord}
        />

        <div className="mt-5 border-line border-t pt-4">
          <div className="mb-2 font-semibold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
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
                    ? 'ring-2 ring-gold ring-offset-2 ring-offset-paper-raised'
                    : 'ring-1 ring-line-strong hover:ring-gold-soft'
                }`}
              />
            ))}
            {color ? (
              <button
                type="button"
                onClick={() => removeHighlight(book, chapter, verse)}
                className="ml-1 font-semibold text-[12px] text-muted-2 hover:text-gold"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5 border-line border-t pt-4">
          <button type="button" className={action} onClick={() => copy('text')}>
            {copied === 'text' ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className={action} onClick={() => copy('link')}>
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
          className="mt-6 w-full rounded-lg border border-gold-soft/50 px-3 py-2 font-semibold text-[12.5px] text-gold hover:bg-gold/5"
        >
          Study a word — or tap any word in the verse
        </button>
      </div>
    </>
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
    <div className="mt-5 border-line border-t pt-4">
      <div className="mb-2 font-semibold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
        {label}
      </div>
      {children}
    </div>
  );
}

// The verse's footnotes (with their reading letters), cross-references, and
// source-text overlays — surfaced together so the verse view is a study view.
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
                className="flex gap-2 text-[13.5px] text-ink leading-relaxed"
              >
                <span className="font-semibold text-gold italic">{label}</span>
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
                  className="font-semibold text-gold hover:underline"
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
          <ul className="space-y-2 text-[13px] text-muted leading-relaxed">
            {overlays.divineNames.length > 0 ? (
              <li>
                <span className="font-semibold text-ink">Divine name</span> —
                the LORD renders the Tetragrammaton{' '}
                <span className="font-hebrew" dir="rtl" lang="he">
                  יְהוָה
                </span>{' '}
                (YHWH).
              </li>
            ) : null}
            {overlays.hasOtQuote ? (
              <li>
                <span className="font-semibold text-ink">
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
                <span className="font-semibold text-ink">Hallelujah</span> —
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
      <p className="font-serif text-[18px] text-ink leading-relaxed">
        {verseText}
      </p>
    );
  }
  return (
    <p className="font-serif text-[18px] text-ink leading-relaxed">
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
            // biome-ignore lint/a11y/useSemanticElements: a span keeps inline text flow; it carries the button role + keyboard handlers
            <span
              key={`w${i}`}
              role="button"
              tabIndex={0}
              className="cursor-pointer rounded-[2px] hover:bg-gold/10 hover:text-gold"
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
              // biome-ignore lint/a11y/noAutofocus: the note editor is opened intentionally by the user
              autoFocus
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder={`Note on ${label}…`}
              rows={4}
              className="w-full resize-none rounded-lg border border-line-strong bg-paper-soft px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-gold-soft"
            />
            {field.state.meta.isTouched && field.state.meta.errors[0] ? (
              <span className="px-0.5 text-[11.5px] text-redletter">
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
            className="mr-auto rounded-lg px-2.5 py-1.5 font-semibold text-[12px] text-redletter hover:bg-paper-soft"
          >
            Delete
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2.5 py-1.5 font-semibold text-[12px] text-muted-2 hover:bg-paper-soft"
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
              className="rounded-lg bg-gold px-3 py-1.5 font-bold text-[#1f1d18] text-[12px] disabled:opacity-50"
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
        className="group flex flex-col gap-1 border-line border-b px-5 py-3 text-left hover:bg-paper-soft"
      >
        <span className="font-semibold text-[11px] text-gold uppercase tracking-[0.12em] group-hover:underline">
          ‹ {reference}
        </span>
        <span className="line-clamp-2 text-[12.5px] text-muted-2 italic">
          {verseText}
        </span>
      </button>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isLoading ? (
          <p className="text-[13px] text-faint">Loading…</p>
        ) : (
          <>
            {lexeme ? (
              <LexemeBody lexeme={lexeme} isHebrew={isHebrew} />
            ) : (
              <p className="text-[13px] text-faint">
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

      <footer className="border-line border-t px-5 py-2.5 text-[11px] text-faint">
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
          className={`text-[34px] text-ink-strong leading-none ${
            isHebrew ? 'font-hebrew' : 'font-serif'
          }`}
          dir={isHebrew ? 'rtl' : 'ltr'}
          lang={isHebrew ? 'he' : 'el'}
        >
          {lexeme.lemma}
        </span>
        <span className="rounded-full border border-line-strong bg-paper-soft px-2.5 py-[3px] font-mono font-semibold text-[11px] text-muted">
          {lexeme.strong}
        </span>
      </div>

      {lexeme.transliteration || lexeme.pronunciation ? (
        <div className="mt-2 text-[14px] text-muted italic">
          {lexeme.transliteration}
          {lexeme.transliteration && lexeme.pronunciation ? ' · ' : ''}
          {lexeme.pronunciation}
        </div>
      ) : null}

      <div className="mt-1 font-semibold text-[11px] text-faint uppercase tracking-[0.1em]">
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
    <div className="mt-5 space-y-4 border-line border-t pt-4">
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
      <div className="mb-1 font-semibold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
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
                  className="font-semibold text-gold hover:underline"
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted leading-relaxed">
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
      <div className="mb-1 font-semibold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
        {label}
      </div>
      <p className="text-[14px] text-ink leading-relaxed">{children}</p>
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
    <div className="mt-5 border-line border-t pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between font-semibold text-[12.5px] text-gold outline-none focus-visible:underline"
      >
        <span>Other occurrences</span>
        <span className="text-[11px] text-muted-2">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        isLoading ? (
          <p className="mt-3 text-[13px] text-faint">Loading…</p>
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
                      className="font-semibold text-gold hover:underline"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-muted">{label}</span>
                  )}{' '}
                  <span className="text-muted-2">{o.text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-faint">No other occurrences.</p>
        )
      ) : null}
    </div>
  );
}
