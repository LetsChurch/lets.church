// Transcript tokenization shared by the reference finders. Tokens are the
// whitespace-separated words of a paragraph's text — the same units the
// annotation word ranges ([startWord, endWord)) index.

export type Token = {
  raw: string;
  // Lowercased with surrounding punctuation stripped ("3:16," → "3:16").
  clean: string;
  // Punctuation stripped from either side; transcripts say "1 .5" for 1:5
  // and "3, 16" for 3:16, so these carry meaning.
  lead: string;
  trail: string;
};

export function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .filter((raw) => raw.length > 0)
    .map((raw) => {
      const lead = /^[^\p{L}\p{N}]*/u.exec(raw)?.[0] ?? '';
      const rest = raw.slice(lead.length);
      const trail = /[^\p{L}\p{N}]*$/u.exec(rest)?.[0] ?? '';
      return {
        raw,
        clean: rest.slice(0, rest.length - trail.length).toLowerCase(),
        lead,
        trail,
      };
    });
}

export function isCapitalized(token: Token | undefined): boolean {
  const first = token?.raw.replace(/^[^\p{L}]+/u, '')[0];
  return first !== undefined && first !== first.toLowerCase();
}

const UNITS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

export type ParsedNumber = {
  value: number;
  // Exclusive token index after the number.
  end: number;
  spelled: boolean;
};

/**
 * Read a cardinal number starting at `tokens[i]`: digits ("16") or words
 * ("sixteen", "twenty three", "twenty-three", "one hundred and nineteen").
 * A token's trailing punctuation ends the number, so "twenty, three" is 20.
 */
export function parseNumber(
  tokens: readonly Token[],
  i: number,
): ParsedNumber | null {
  const token = tokens[i];
  if (!token) return null;
  if (/^\d{1,3}$/.test(token.clean)) {
    return { value: Number(token.clean), end: i + 1, spelled: false };
  }

  // Spelled: split hyphenated words into their own parts.
  let j = i;
  let value = 0;
  let seen = false;
  const parts = (k: number) => tokens[k]?.clean.split('-') ?? [];
  const stops = (k: number) => (tokens[k]?.trail ?? '') !== '';

  const first = parts(j);
  if (first.length === 0) return null;
  // "a hundred" / "one hundred" / "hundred"
  let hundredAt = j;
  if (
    (first[0] === 'a' || first[0] === 'one') &&
    first.length === 1 &&
    !stops(j) &&
    parts(j + 1)[0] === 'hundred'
  ) {
    hundredAt = j + 1;
  }
  if (parts(hundredAt)[0] === 'hundred' && parts(hundredAt).length === 1) {
    value = 100;
    seen = true;
    j = hundredAt + 1;
    if (stops(hundredAt)) return { value, end: j, spelled: true };
    if (parts(j)[0] === 'and' && !stops(j)) j += 1;
  }

  const words = parts(j);
  const tens = TENS[words[0] ?? ''];
  const unit = UNITS[words[0] ?? ''];
  if (tens !== undefined) {
    value += tens;
    seen = true;
    if (words.length === 2) {
      const after = UNITS[words[1] ?? ''];
      if (after === undefined || after > 9) return null;
      return { value: value + after, end: j + 1, spelled: true };
    }
    if (words.length > 2) return null;
    j += 1;
    if (!stops(j - 1)) {
      const next = parts(j);
      const after = next.length === 1 ? UNITS[next[0] ?? ''] : undefined;
      if (after !== undefined && after <= 9) {
        return { value: value + after, end: j + 1, spelled: true };
      }
    }
    return { value, end: j, spelled: true };
  }
  if (unit !== undefined && words.length === 1) {
    return { value: value + unit, end: j + 1, spelled: true };
  }
  return seen ? { value, end: j, spelled: true } : null;
}
