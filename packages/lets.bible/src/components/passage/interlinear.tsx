import type { WordRef } from './passage';

// One word of the interlinear, as returned by `bible.interlinear` (a token
// left-joined to its lexicon entry).
export type InterlinearRow = {
  verse: number;
  position: number;
  surface: string;
  strong: string | null;
  lemma: string | null;
  transliteration: string | null;
  language: string | null; // 'greek' | 'hebrew'
  gloss: string | null;
  divineName: boolean;
  otQuote: boolean;
  wordsOfJesus: boolean;
};

// Which stacked lines show + the stack order. Owned by the reader so the
// full-width controls bar (a second sticky header) and the token flow stay in
// sync.
export type InterlinearOptions = {
  englishFirst: boolean; // English gloss leads (reverse interlinear) vs original
  showTranslit: boolean;
  showGloss: boolean;
  showStrong: boolean;
};

export const DEFAULT_INTERLINEAR_OPTIONS: InterlinearOptions = {
  englishFirst: false,
  showTranslit: true,
  showGloss: true,
  showStrong: true,
};

// Function words (articles) render faded, like the design's τῇ / τὸν / τὰ.
function isFunctionWord(w: InterlinearRow): boolean {
  return w.strong === 'G3588' || /^(the|a|an)$/i.test(w.surface.trim());
}

const segBase = 'rounded-[7px] px-3.5 py-1.5 text-[13px] outline-none';
const chipBase =
  'rounded-full border border-[#e0d8c6] bg-[#efe9da] px-[11px] py-[5px] font-semibold text-[12px] outline-none transition focus-visible:ring-2 focus-visible:ring-gold/40';

// The full-width controls bar — a second sticky header under the reader chrome.
// Word-order segmented toggle on the left; line toggles on the right. "Greek ·
// locked" (the original line is always shown) and "Parsing" are inert: parsing
// isn't in our seed data, and the original line can't be hidden.
export function InterlinearControls({
  options,
  onChange,
}: {
  options: InterlinearOptions;
  onChange: (next: InterlinearOptions) => void;
}) {
  const { englishFirst, showTranslit, showGloss, showStrong } = options;
  const set = (patch: Partial<InterlinearOptions>) =>
    onChange({ ...options, ...patch });

  return (
    // A deterministic 60px tall at lg (matches the header), so the desktop study
    // drawer can sit flush below both at top-30 (120px) without overlapping.
    // Below lg it may wrap to a taller bar (mobile uses a bottom-sheet panel, not
    // the top-offset rail, so that doesn't matter).
    <div className="sticky top-15 z-20 flex min-h-14 flex-shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-line border-b bg-paper-soft/95 px-4 py-2.5 backdrop-blur-sm sm:px-[26px] lg:h-15 lg:flex-nowrap">
      <div className="flex items-center gap-2.5">
        <span className="text-[12px] text-faint">Word order</span>
        <div className="inline-flex gap-0.5 rounded-[10px] border border-line-strong bg-paper p-[3px]">
          <button
            type="button"
            onClick={() => set({ englishFirst: false })}
            className={`${segBase} ${
              englishFirst
                ? 'font-medium text-muted-2'
                : 'bg-paper-raised font-semibold text-ink shadow-sm'
            }`}
          >
            Original
          </button>
          <button
            type="button"
            onClick={() => set({ englishFirst: true })}
            className={`${segBase} ${
              englishFirst
                ? 'bg-paper-raised font-semibold text-ink shadow-sm'
                : 'font-medium text-muted-2'
            }`}
          >
            English (reverse)
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-0.5 text-[12px] text-faint">Lines</span>
        <span
          className={`${chipBase} cursor-default text-[#9a9384] opacity-70`}
        >
          Original · locked
        </span>
        <LineChip
          label="Translit"
          on={showTranslit}
          onToggle={() => set({ showTranslit: !showTranslit })}
        />
        <LineChip
          label="Gloss"
          on={showGloss}
          onToggle={() => set({ showGloss: !showGloss })}
        />
        <LineChip
          label="Strong’s"
          on={showStrong}
          onToggle={() => set({ showStrong: !showStrong })}
        />
        <span
          title="Parsing isn’t available in this text"
          className={`${chipBase} cursor-default text-[#9a9384] opacity-70`}
        >
          Parsing
        </span>
      </div>
    </div>
  );
}

function LineChip({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`${chipBase} ${
        on ? 'text-[#3f3c34]' : 'border-line-strong bg-transparent text-faint'
      }`}
    >
      {label}
    </button>
  );
}

// One stacked token — original-language lemma, transliteration, English gloss,
// and Strong's, centered and stacked (no card border). `englishFirst` flips the
// stack so the English gloss leads. Tapping opens the word study panel.
function Token({
  w,
  selected,
  onSelect,
  options,
  redLetter,
}: {
  w: InterlinearRow;
  selected: boolean;
  onSelect: () => void;
  options: InterlinearOptions;
  redLetter: boolean;
}) {
  const { englishFirst, showTranslit, showGloss, showStrong } = options;
  const isHebrew = w.language === 'hebrew';
  const faded = isFunctionWord(w);
  const showRed = w.wordsOfJesus && redLetter;

  const lemma = w.lemma ? (
    <span
      key="lemma"
      dir={isHebrew ? 'rtl' : 'ltr'}
      lang={isHebrew ? 'he' : 'el'}
      // Selection is shown by the token's background + inset ring (below), not a
      // weight change — bolding here would widen the glyph and shift the layout.
      className={`text-[22px] leading-[1.25] ${
        isHebrew ? 'font-hebrew' : 'font-greek'
      } ${faded ? 'text-faint' : 'text-ink-strong'}`}
    >
      {w.lemma}
    </span>
  ) : null;

  const gloss =
    showGloss || englishFirst ? (
      <span
        key="gloss"
        // Weight depends only on the englishFirst MODE (stable), never on
        // selection — changing weight on select would widen the text and shift
        // the layout. Selection only deepens the color (muted → ink).
        className={`whitespace-nowrap text-[13px] leading-tight ${
          englishFirst ? 'font-semibold' : ''
        } ${
          showRed
            ? 'text-redletter'
            : faded
              ? 'text-faint'
              : englishFirst || selected
                ? 'text-ink'
                : 'text-muted'
        }`}
      >
        {w.surface}
      </span>
    ) : null;

  const translit =
    showTranslit && w.transliteration ? (
      <span
        key="translit"
        className={`font-serif text-[12px] italic leading-tight ${
          faded ? 'text-faint-2' : 'text-muted-2'
        }`}
      >
        {w.transliteration}
      </span>
    ) : null;

  const strong =
    showStrong && w.strong ? (
      <span
        key="strong"
        className={`font-mono text-[9.5px] leading-tight ${
          faded ? 'text-faint-2' : selected ? 'text-gold' : 'text-gold-soft'
        }`}
      >
        {w.strong}
      </span>
    ) : null;

  const lines = englishFirst
    ? [gloss, lemma, translit, strong]
    : [lemma, translit, gloss, strong];

  return (
    <button
      type="button"
      onClick={onSelect}
      data-strong={w.strong ?? undefined}
      className={`flex flex-col items-center gap-[3px] rounded-[10px] px-2 py-1.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/40 ${
        selected
          ? 'bg-[rgba(154,123,63,0.14)] shadow-[inset_0_0_0_1px_rgba(154,123,63,0.42)]'
          : 'hover:bg-[rgba(154,123,63,0.07)]'
      }`}
    >
      {lines.filter(Boolean)}
    </button>
  );
}

// Interlinear reading: the chapter's words as stacked tokens (display options
// come from the controls bar). Tapping a word opens the study panel. Our seed
// carries reading order + dictionary lemmas (no inflected original text, original
// word order, or parsing), so this is the design's interlinear styling over
// reading-order data — not a Greek-order morphological interlinear.
export function Interlinear({
  rows,
  options,
  selectedWord,
  onSelectWord,
  verseNumbers = true,
  redLetter = true,
}: {
  rows: InterlinearRow[];
  options: InterlinearOptions;
  selectedWord: { verse: number; position: number } | null;
  onSelectWord: (word: WordRef) => void;
  verseNumbers?: boolean;
  redLetter?: boolean;
}) {
  // Group words by verse, preserving reading order.
  const verses: { verse: number; words: InterlinearRow[] }[] = [];
  for (const row of rows) {
    const last = verses[verses.length - 1];
    if (last && last.verse === row.verse) {
      last.words.push(row);
    } else {
      verses.push({ verse: row.verse, words: [row] });
    }
  }

  return (
    // Verses stack vertically. Each verse is a row: a fixed-width gutter holding
    // the verse number, then the tokens in their own wrapping column — so wrapped
    // words align under the first word, never under the verse number.
    <div className="flex flex-col gap-y-8">
      {verses.map(({ verse, words }) => (
        <div key={verse} className="flex items-start gap-x-2">
          {verseNumbers ? (
            <div className="mt-2 w-9 flex-shrink-0">
              <span className="rounded-[5px] border border-gold-soft/40 bg-gold/10 px-1.5 py-px font-bold font-sans text-[12px] text-gold-soft">
                {verse}
              </span>
            </div>
          ) : null}
          <div className="flex flex-1 flex-wrap items-start gap-x-[18px] gap-y-[26px]">
            {words.map((w) => (
              <Token
                key={w.position}
                w={w}
                selected={
                  selectedWord?.verse === verse &&
                  selectedWord?.position === w.position
                }
                onSelect={() =>
                  onSelectWord({
                    verse,
                    position: w.position,
                    strong: w.strong ?? '',
                    surface: w.surface,
                    divineName: w.divineName,
                    otQuote: w.otQuote,
                  })
                }
                options={options}
                redLetter={redLetter}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
