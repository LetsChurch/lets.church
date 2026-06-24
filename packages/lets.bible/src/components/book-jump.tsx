import { Separator } from '@base-ui/react/separator';
import { type MouseEvent, useState } from 'react';
import { bookGlyph } from '@/lib/book-search';
import { type CanonBook, NEW_TESTAMENT, OLD_TESTAMENT } from '@/lib/canon';

// Keep focus in the search input (and the autocomplete open) when a widget
// button is pressed — otherwise the click blurs the input and closes the popup.
const keepFocus = (e: MouseEvent) => e.preventDefault();

// A "›" breadcrumb separator — the Base UI Separator primitive (role="separator")
// composed via `render` so it keeps the chevron glyph.
function Sep() {
  return (
    <Separator
      orientation="vertical"
      className="select-none text-[11px] text-faint"
      render={<span>›</span>}
    />
  );
}

// The interactive book navigator: a single breadcrumb (Books › Book › Chapter)
// over a grid. The parsed query drives the stage (book → chapter → verse via
// `chapter`/`verse`); clicking a chapter drills in (fills the input), a verse
// navigates, and the "Books" crumb opens the whole-canon picker.
export type BookJumpModel = {
  book: CanonBook;
  chapter: number | null; // selected chapter (parsed from the query)
  verse: number | null; // selected verse (parsed from the query)
  versesPerChapter: number[]; // for the active book, from structure.json
  pickText: string | null; // verse text when a verse is selected (if loaded)
  activeChapter?: number | null; // "you are here" — current chapter, highlighted in the grid
};

function Cell({
  n,
  selected,
  onClick,
  size,
}: {
  n: number;
  selected: boolean;
  onClick: () => void;
  size: 'ch' | 'v';
}) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center justify-center rounded-[7px] border font-semibold tabular-nums transition ${
        size === 'ch' ? 'h-9 text-[14px]' : 'h-[34px] text-[13px]'
      } ${
        selected
          ? 'border-gold bg-gold text-white'
          : 'border-line bg-paper-raised text-ink hover:border-gold-soft hover:bg-paper-soft'
      }`}
    >
      {n}
    </button>
  );
}

// The inline book picker: the full canon as compact abbreviation tiles (e.g.
// "Gen", "1Co"), grouped OT / NT, with the full name on hover / for screen
// readers. Far shorter than a full-name list. Picking one fills the input with
// the book name, which re-derives the widget into that book's chapter grid.
// Reused standalone in the empty search box (no current book → pass `current=""`).
// The columns auto-fill to the dropdown's width (more on the wide homepage bar,
// fewer in the narrow reader header).
export function BookList({
  current,
  onPick,
}: {
  current: string; // active book slug, highlighted
  onPick: (book: CanonBook) => void;
}) {
  const group = (label: string, books: CanonBook[]) => (
    <div className="mb-2">
      <div className="px-0.5 pt-2 pb-1.5 font-bold text-[10px] text-faint uppercase tracking-[0.1em]">
        {label}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-1.5">
        {books.map((b) => (
          <button
            key={b.slug}
            type="button"
            onMouseDown={keepFocus}
            onClick={() => onPick(b)}
            title={b.name}
            aria-label={b.name}
            aria-current={b.slug === current ? 'true' : undefined}
            className={`flex h-9 items-center justify-center rounded-[7px] border font-semibold text-[12.5px] transition ${
              b.slug === current
                ? 'border-gold bg-gold text-white'
                : 'border-line bg-paper-raised text-ink hover:border-gold-soft hover:bg-paper-soft'
            }`}
          >
            {bookGlyph(b)}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <>
      {group('Old Testament', OLD_TESTAMENT)}
      {group('New Testament', NEW_TESTAMENT)}
    </>
  );
}

export function BookJump({
  model,
  onFill,
  onNavigate,
}: {
  model: BookJumpModel;
  onFill: (text: string) => void;
  onNavigate: (slug: string, chapter: number, verse?: number) => void;
}) {
  const { book, chapter, verse, versesPerChapter, pickText, activeChapter } =
    model;
  // The book-picker view (browse the whole canon) vs the chapter/verse grid.
  const [booksOpen, setBooksOpen] = useState(false);
  const inVerse = chapter != null;
  const verseCount = inVerse ? (versesPerChapter[chapter - 1] ?? 0) : 0;

  return (
    <section
      aria-label={`Jump to ${book.name}`}
      className="border-line border-b"
    >
      {/* breadcrumb navigator: Books › Book › Chapter. The breadcrumb stays on
          one line (nowrap); the hint wraps below it as a whole when there's no
          room, instead of breaking mid-word. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => setBooksOpen((o) => !o)}
            aria-expanded={booksOpen}
            className={`font-semibold text-[12.5px] ${
              booksOpen ? 'text-gold' : 'text-muted-2 hover:text-gold'
            }`}
          >
            Books
          </button>
          {booksOpen ? null : (
            <>
              <Sep />
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => onFill(book.name)}
                className="font-semibold text-[12.5px] text-gold"
              >
                {book.name}
              </button>
              {inVerse ? (
                <>
                  <Sep />
                  <span className="font-semibold text-[12.5px] text-gold">
                    Chapter {chapter}
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>
        <span className="whitespace-nowrap text-[11.5px] text-faint">
          {booksOpen
            ? 'Choose a book'
            : inVerse
              ? 'Choose a verse · or press Enter for the chapter'
              : 'Choose a chapter'}
        </span>
      </div>

      {/* book picker, or the chapter / verse grid. No own scroll — the popup is
          the single scroll container (avoid nested scrolling). */}
      <div className="bg-paper-soft px-4 pt-2.5 pb-3">
        {booksOpen ? (
          <BookList
            current={book.slug}
            onPick={(b) => {
              setBooksOpen(false);
              onFill(b.name);
            }}
          />
        ) : inVerse ? (
          <div className="grid grid-cols-8 gap-[6px]">
            {Array.from({ length: verseCount }, (_, i) => i + 1).map((n) => (
              <Cell
                key={n}
                n={n}
                size="v"
                selected={verse === n}
                onClick={() => onNavigate(book.slug, chapter, n)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-[6px]">
            {Array.from({ length: book.chapterCount }, (_, i) => i + 1).map(
              (n) => (
                <Cell
                  key={n}
                  n={n}
                  size="ch"
                  selected={n === activeChapter}
                  onClick={() => onFill(`${book.name} ${n}`)}
                />
              ),
            )}
          </div>
        )}

        {/* whole book / chapter shortcut (not in the book picker) */}
        {booksOpen ? null : (
          <div className="mt-3">
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() =>
                inVerse
                  ? onNavigate(book.slug, chapter)
                  : onNavigate(book.slug, 1)
              }
              className="font-semibold text-[12px] text-gold hover:underline"
            >
              {inVerse
                ? `Read all of ${book.name} ${chapter}`
                : 'Read whole book'}
            </button>
          </div>
        )}
      </div>

      {/* picked-verse preview */}
      {inVerse && verse != null ? (
        <div className="flex items-center gap-3 border-line border-t bg-paper-raised px-4 py-3">
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gold" />
          <div className="min-w-0 flex-1">
            <div className="font-bold font-serif text-[16px] text-ink-strong">
              {book.name} {chapter}:{verse}
            </div>
            {pickText ? (
              <div className="truncate font-serif text-[14px] text-muted">
                {pickText}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={() => onNavigate(book.slug, chapter, verse)}
            className="flex-shrink-0 rounded-[9px] bg-ink-strong px-[14px] py-2 font-semibold text-[13px] text-white"
          >
            Open
          </button>
        </div>
      ) : null}
    </section>
  );
}
