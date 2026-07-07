import { decodeMorph } from '@/lib/morph';

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
  showParsing: boolean; // grammar/morphology line (true interlinear only)
};

export const DEFAULT_INTERLINEAR_OPTIONS: InterlinearOptions = {
  englishFirst: false,
  showTranslit: true,
  showGloss: true,
  showStrong: true,
  showParsing: false,
};

// Function words (articles) render faded, like the design's τῇ / τὸν / τὰ.
function isFunctionWord(w: InterlinearRow): boolean {
  return w.strong === 'G3588' || /^(the|a|an)$/i.test(w.surface.trim());
}

const segBase = 'rounded-[7px] px-3.5 py-1.5 text-[13px] outline-none';
// Layout + focus only; each chip state sets its own token-based colors so it
// adapts to dark mode (the old hardcoded cream bg / gray text washed out).
const chipBase =
  'rounded-full border px-[11px] py-[5px] font-semibold text-[12px] outline-none transition focus-visible:ring-2 focus-visible:ring-gold/40';

// The full-width controls bar — a second sticky header under the reader chrome.
// Word-order segmented toggle on the left; line toggles on the right (the
// original-language line itself is always shown, so it isn't a toggle).
// "Parsing" is a live toggle when the passage has morphology
// (`parsingAvailable`), else inert.
export function InterlinearControls({
  options,
  onChange,
  parsingAvailable = false,
  reverseAvailable = true,
}: {
  options: InterlinearOptions;
  onChange: (next: InterlinearOptions) => void;
  // True once a chapter has original-language source tokens with morphology, so
  // the "Parsing" line is a real toggle rather than an inert "not in our data".
  parsingAvailable?: boolean;
  // True when the translation has its own Strong's-tagged English tokens, so the
  // reading-order "English (reverse)" word order is offered. Public-domain texts
  // without per-word Strong's (e.g. WEB) only have the original-language view.
  reverseAvailable?: boolean;
}) {
  const { englishFirst, showTranslit, showGloss, showStrong, showParsing } =
    options;
  const set = (patch: Partial<InterlinearOptions>) =>
    onChange({ ...options, ...patch });

  return (
    // A deterministic 60px tall at lg (matches the header), so the desktop study
    // drawer can sit flush below both at top-30 (120px) without overlapping.
    // Below lg it may wrap to a taller bar (mobile uses a bottom-sheet panel, not
    // the top-offset rail, so that doesn't matter).
    <div className="border-line bg-paper-soft/95 sticky top-15 z-20 flex min-h-14 flex-shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-2.5 backdrop-blur-sm sm:px-[26px] lg:h-15 lg:flex-nowrap">
      {reverseAvailable ? (
        <div className="flex items-center gap-2.5">
          <span className="text-muted text-[12px]">Word order</span>
          <div className="border-line-strong bg-paper inline-flex gap-0.5 rounded-[10px] border p-[3px]">
            <button
              type="button"
              onClick={() => set({ englishFirst: false })}
              className={`${segBase} ${
                englishFirst
                  ? 'text-muted hover:text-ink font-medium'
                  : 'bg-paper-raised text-ink-strong font-semibold shadow-sm'
              }`}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => set({ englishFirst: true })}
              className={`${segBase} ${
                englishFirst
                  ? 'bg-paper-raised text-ink-strong font-semibold shadow-sm'
                  : 'text-muted hover:text-ink font-medium'
              }`}
            >
              English (reverse)
            </button>
          </div>
        </div>
      ) : (
        // No per-word Strong's in this translation (e.g. WEB) — there's only the
        // original-language interlinear, so a word-order control is meaningless.
        // Hide it entirely; the empty spacer keeps the Lines controls right-aligned.
        <div />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted mr-0.5 text-[12px]">Lines</span>
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
        {parsingAvailable ? (
          <LineChip
            label="Parsing"
            on={showParsing}
            onToggle={() => set({ showParsing: !showParsing })}
          />
        ) : (
          <span
            title="Parsing isn’t available for this passage yet"
            className={`${chipBase} border-line-strong text-muted-2 cursor-default border-dashed bg-transparent`}
          >
            Parsing
          </span>
        )}
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
        on
          ? 'border-gold-soft/60 bg-gold/15 text-ink-strong'
          : 'border-line-strong text-muted hover:border-gold-soft/50 hover:text-ink bg-transparent'
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
        className={`text-[13px] leading-tight whitespace-nowrap ${
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
        className={`font-serif text-[12px] leading-tight italic ${
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
      className={`focus-visible:ring-gold/40 flex flex-col items-center gap-[3px] rounded-[10px] px-2 py-1.5 text-center transition-colors outline-none focus-visible:ring-2 ${
        selected
          ? 'bg-[rgba(154,123,63,0.14)] shadow-[inset_0_0_0_1px_rgba(154,123,63,0.42)]'
          : 'hover:bg-[rgba(154,123,63,0.07)]'
      }`}
    >
      {lines.filter(Boolean)}
    </button>
  );
}

// Reverse interlinear: the chapter's words in ENGLISH reading order, each shown
// with its Strong's dictionary lemma/translit/gloss (from bible_token + the
// bible_lexeme join). Tapping a word opens the study panel. This is the
// English-anchored view; the Greek/Hebrew-order morphological interlinear
// (inflected surface forms in original word order + parsing) is SourceInterlinear
// below, driven by bible_source_token.
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
              <span className="border-gold-soft/40 bg-gold/10 text-gold-soft rounded-[5px] border px-1.5 py-px font-sans text-[12px] font-bold">
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

// One original-language word, as returned by `bible.sourceInterlinear` (a source
// token in original Greek/Hebrew order).
export type SourceInterlinearRow = {
  verse: number;
  position: number;
  surface: string; // inflected original form
  transliteration: string | null;
  strong: string | null;
  lemma: string | null;
  gloss: string | null;
  english: string | null; // contextual English for this word
  morph: string | null; // parsing code, e.g. 'V-AAI-3S'
  language: string; // 'greek' | 'hebrew'
};

// One stacked token of the TRUE interlinear: the inflected original word on top,
// then transliteration, the contextual English, Strong's, and the parsing code
// (hover for the decoded grammar). Tapping opens the word study panel.
function SourceToken({
  w,
  selected,
  onSelect,
  options,
}: {
  w: SourceInterlinearRow;
  selected: boolean;
  onSelect: () => void;
  options: InterlinearOptions;
}) {
  const { showTranslit, showGloss, showStrong, showParsing } = options;
  const isHebrew = w.language === 'hebrew';
  const faded = w.strong === 'G3588' || w.morph === 'Td'; // article, rendered quietly
  const parsed = showParsing ? decodeMorph(w.morph, w.language) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      data-strong={w.strong ?? undefined}
      className={`focus-visible:ring-gold/40 flex flex-col items-center gap-[3px] rounded-[10px] px-2 py-1.5 text-center transition-colors outline-none focus-visible:ring-2 ${
        selected
          ? 'bg-[rgba(154,123,63,0.14)] shadow-[inset_0_0_0_1px_rgba(154,123,63,0.42)]'
          : 'hover:bg-[rgba(154,123,63,0.07)]'
      }`}
    >
      <span
        dir={isHebrew ? 'rtl' : 'ltr'}
        lang={isHebrew ? 'he' : 'el'}
        className={`text-[22px] leading-[1.25] ${
          isHebrew ? 'font-hebrew' : 'font-greek'
        } ${faded ? 'text-faint' : 'text-ink-strong'}`}
      >
        {w.surface}
      </span>
      {showTranslit && w.transliteration ? (
        <span
          className={`font-serif text-[12px] leading-tight italic ${
            faded ? 'text-faint-2' : 'text-muted-2'
          }`}
        >
          {w.transliteration}
        </span>
      ) : null}
      {showGloss && w.english ? (
        <span
          className={`text-[13px] leading-tight whitespace-nowrap ${
            faded ? 'text-faint' : selected ? 'text-ink' : 'text-muted'
          }`}
        >
          {w.english}
        </span>
      ) : null}
      {showStrong && w.strong ? (
        <span
          className={`font-mono text-[9.5px] leading-tight ${
            faded ? 'text-faint-2' : selected ? 'text-gold' : 'text-gold-soft'
          }`}
        >
          {w.strong}
        </span>
      ) : null}
      {parsed ? (
        <span
          title={parsed.label}
          className="text-muted-2 font-mono text-[9.5px] leading-tight"
        >
          {parsed.raw}
        </span>
      ) : null}
    </button>
  );
}

// The TRUE morphological interlinear: the chapter's words in ORIGINAL
// (Greek/Hebrew) word order — sourced from STEPBible TAGNT/TAHOT — each stacked
// with transliteration, contextual English, Strong's, and parsing. Distinct from
// `Interlinear` above, which renders the English reading order. Tapping a word
// opens its study panel.
export function SourceInterlinear({
  rows,
  options,
  selectedWord,
  onSelectWord,
  verseNumbers = true,
}: {
  rows: SourceInterlinearRow[];
  options: InterlinearOptions;
  selectedWord: { verse: number; position: number } | null;
  onSelectWord: (word: WordRef) => void;
  verseNumbers?: boolean;
}) {
  const verses: { verse: number; words: SourceInterlinearRow[] }[] = [];
  for (const row of rows) {
    const last = verses[verses.length - 1];
    if (last && last.verse === row.verse) {
      last.words.push(row);
    } else {
      verses.push({ verse: row.verse, words: [row] });
    }
  }

  return (
    <div className="flex flex-col gap-y-8">
      {verses.map(({ verse, words }) => {
        // Hebrew reads right-to-left, so its tokens flow RTL within the content
        // area (the verse-number gutter stays on the left, as elsewhere).
        const rtl = words[0]?.language === 'hebrew';
        return (
          <div key={verse} className="flex items-start gap-x-2">
            {verseNumbers ? (
              <div className="mt-2 w-9 flex-shrink-0">
                <span className="border-gold-soft/40 bg-gold/10 text-gold-soft rounded-[5px] border px-1.5 py-px font-sans text-[12px] font-bold">
                  {verse}
                </span>
              </div>
            ) : null}
            <div
              dir={rtl ? 'rtl' : 'ltr'}
              className="flex flex-1 flex-wrap items-start gap-x-[18px] gap-y-[26px]"
            >
              {words.map((w) => (
                <SourceToken
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
                      morph: w.morph ?? undefined,
                      language: w.language,
                    })
                  }
                  options={options}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
