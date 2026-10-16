// Upper bound on a stored transcript paragraph's text. The transcriber only
// breaks paragraphs at its own markers, so a long stretch with none became a
// single paragraph of 35k+ characters. That is too big for OpenSearch's wildcard
// doc values (32,766 bytes, which rejects the whole media doc), and the search
// windows built from it exceed the embedding model's 8,192-token input. Normal
// paragraphs are tiny (p99 ≈ 500 characters), so this only touches outliers.
export const MAX_PARAGRAPH_CHARS = 4000;

const segmentLength = (s: { text: string }) => s.text.trim().length + 1;

/**
 * Split any paragraph group longer than `max` characters into roughly equal
 * runs of consecutive segments. Segments are sentence-level, so splits land on
 * sentence boundaries; a single segment is never divided (one longer than `max`
 * becomes its own paragraph). Groups at or under the cap pass through as-is.
 */
export function splitOversizedParagraphs<T extends { text: string }>(
  groups: T[][],
  max = MAX_PARAGRAPH_CHARS,
): T[][] {
  return groups.flatMap((segs) => {
    const total = segs.reduce((n, s) => n + segmentLength(s), 0);
    if (total <= max || segs.length < 2) return [segs];

    // Aim for evenly sized parts rather than filling each to the cap, so the
    // tail isn't a stub.
    const target = total / Math.ceil(total / max);
    const out: T[][] = [];
    let current: T[] = [];
    let currentLength = 0;
    for (const seg of segs) {
      const len = segmentLength(seg);
      if (
        current.length > 0 &&
        (currentLength + len > max || currentLength >= target)
      ) {
        out.push(current);
        current = [];
        currentLength = 0;
      }
      current.push(seg);
      currentLength += len;
    }
    if (current.length > 0) out.push(current);
    return out;
  });
}

/**
 * Split any segment longer than `max` characters into roughly equal runs of
 * its words. Segments are normally single sentences, but the sentence
 * splitter occasionally returns a whole unpunctuated stretch (35k+ characters,
 * thousands of words) as one, which `splitOversizedParagraphs` can't divide.
 * Each piece keeps the segment's speaker and paragraph fields, takes its
 * timing from its words, and only the first piece keeps `isParagraphStart`.
 * Piece text is rebuilt from the words, which carry no surrounding whitespace.
 */
export function splitOversizedSegments<
  T extends {
    text: string;
    start: number;
    end: number;
    isParagraphStart?: boolean | null;
    words: ReadonlyArray<{ word: string; start: number; end: number }>;
  },
>(segments: T[], max = MAX_PARAGRAPH_CHARS): T[] {
  return segments.flatMap((seg) => {
    const total = seg.text.trim().length;
    if (total <= max || seg.words.length < 2) return [seg];

    const target = total / Math.ceil(total / max);
    const pieces: T['words'][number][][] = [];
    let current: T['words'][number][] = [];
    let currentLength = 0;
    for (const word of seg.words) {
      const len = word.word.length + 1;
      if (
        current.length > 0 &&
        (currentLength + len > max || currentLength >= target)
      ) {
        pieces.push(current);
        current = [];
        currentLength = 0;
      }
      current.push(word);
      currentLength += len;
    }
    if (current.length > 0) pieces.push(current);

    return pieces.map((words, i) => ({
      ...seg,
      text: words.map((w) => w.word).join(' '),
      start: words[0]?.start ?? seg.start,
      end: words.at(-1)?.end ?? seg.end,
      isParagraphStart: i === 0 ? seg.isParagraphStart : false,
      words,
    }));
  });
}
