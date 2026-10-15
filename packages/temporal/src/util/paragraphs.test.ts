import { describe, expect, test } from 'vitest';

import { splitOversizedParagraphs } from './paragraphs';

const seg = (n: number, len = 99) => ({ id: n, text: 'x'.repeat(len) });
const lengths = (groups: { text: string }[][]) =>
  groups.map((g) => g.reduce((n, s) => n + s.text.length + 1, 0));

describe('splitOversizedParagraphs', () => {
  test('leaves paragraphs at or under the cap untouched', () => {
    const groups = [[seg(1), seg(2)], [seg(3)]];
    expect(splitOversizedParagraphs(groups, 200)).toEqual(groups);
  });

  test('splits an oversized paragraph into even runs of whole segments', () => {
    // 10 segments × 100 chars = 1000 chars against a 300 cap → 4 parts.
    const group = Array.from({ length: 10 }, (_, i) => seg(i));
    const out = splitOversizedParagraphs([group], 300);

    expect(out.flat()).toEqual(group);
    expect(out).toHaveLength(4);
    for (const len of lengths(out)) expect(len).toBeLessThanOrEqual(300);
  });

  test('keeps a single over-long segment whole', () => {
    const big = seg(1, 1000);
    expect(splitOversizedParagraphs([[big]], 300)).toEqual([[big]]);
    expect(splitOversizedParagraphs([[seg(0), big, seg(2)]], 300)).toEqual([
      [seg(0)],
      [big],
      [seg(2)],
    ]);
  });

  test('preserves paragraph order around a split', () => {
    const before = [seg(100)];
    const after = [seg(200)];
    const long = Array.from({ length: 6 }, (_, i) => seg(i));
    const out = splitOversizedParagraphs([before, long, after], 250);

    expect(out[0]).toEqual(before);
    expect(out.at(-1)).toEqual(after);
    expect(out.slice(1, -1).flat()).toEqual(long);
  });
});
