import { type MouseEvent, useState } from 'react';
import { bookGlyph } from '@/lib/book-search';
import type { CanonBook } from '@/lib/canon';

// Keep focus in the search input (and the autocomplete open) when a widget
// button is pressed — otherwise the click blurs the input and closes the popup.
const keepFocus = (e: MouseEvent) => e.preventDefault();

// The interactive "Jump to book" widget (Smart Autocomplete design). A book row
// expands into a chapter grid → verse grid. It's bidirectional: the parsed query
// drives the stage (book → chapter → verse via `chapter`/`verse`), and clicking a
// cell either fills the input (chapter) or navigates (verse). Clicking the book
// title jumps to the whole book.
export type BookJumpModel = {
  book: CanonBook;
  chapter: number | null; // selected chapter (parsed from the query)
  verse: number | null; // selected verse (parsed from the query)
  versesPerChapter: number[]; // for the active book, from structure.json
  pickText: string | null; // verse text when a verse is selected (if loaded)
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

export function BookJump({
  model,
  onFill,
  onNavigate,
}: {
  model: BookJumpModel;
  onFill: (text: string) => void;
  onNavigate: (slug: string, chapter: number, verse?: number) => void;
}) {
  const { book, chapter, verse, versesPerChapter, pickText } = model;
  const [open, setOpen] = useState(true);
  const inVerse = chapter != null;
  const verseCount = inVerse ? (versesPerChapter[chapter - 1] ?? 0) : 0;

  return (
    <section
      aria-label={`Jump to ${book.name}`}
      className="border-line border-b"
    >
      <div className="px-4 pt-3 pb-1 font-bold text-[10.5px] text-faint uppercase tracking-[0.1em]">
        Jump to book
      </div>

      {/* book row */}
      <div className="flex items-center gap-3 px-4 py-[10px]">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] bg-gold/10 font-serif text-[13px] text-gold">
          {bookGlyph(book)}
        </span>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => onNavigate(book.slug, 1)}
          className="min-w-0 flex-1 truncate text-left text-[15px] text-ink"
        >
          <span className="font-semibold">{book.name}</span>
          <span className="text-faint">
            {' · '}
            {book.chapterCount} chapters
          </span>
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Collapse chapters' : 'Pick a chapter'}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 font-semibold text-[12px] text-gold hover:bg-paper-soft"
        >
          {open ? 'Close' : 'Pick chapter'}
          <span
            className="text-[10px] text-faint transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>
      </div>

      {open ? (
        <div className="border-line border-t bg-paper-soft px-4 pt-2 pb-4">
          {/* breadcrumb */}
          <div className="flex items-center gap-2 py-2">
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
                <span className="text-[11px] text-faint" aria-hidden="true">
                  ›
                </span>
                <span className="font-semibold text-[12.5px] text-gold">
                  Chapter {chapter}
                </span>
              </>
            ) : null}
            <span className="flex-1" />
            <span className="text-[11.5px] text-faint">
              {inVerse
                ? 'Choose a verse · or press Enter for the chapter'
                : 'Choose a chapter'}
            </span>
          </div>

          {/* chapter or verse grid (scrolls if tall) */}
          <div className="max-h-[208px] overflow-y-auto">
            {inVerse ? (
              <div className="grid grid-cols-8 gap-[6px]">
                {Array.from({ length: verseCount }, (_, i) => i + 1).map(
                  (n) => (
                    <Cell
                      key={n}
                      n={n}
                      size="v"
                      selected={verse === n}
                      onClick={() => onNavigate(book.slug, chapter, n)}
                    />
                  ),
                )}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-[6px]">
                {Array.from({ length: book.chapterCount }, (_, i) => i + 1).map(
                  (n) => (
                    <Cell
                      key={n}
                      n={n}
                      size="ch"
                      selected={false}
                      onClick={() => onFill(`${book.name} ${n}`)}
                    />
                  ),
                )}
              </div>
            )}
          </div>

          {/* whole book / chapter shortcut */}
          <div className="mt-3 flex items-center justify-between">
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
        </div>
      ) : null}

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
