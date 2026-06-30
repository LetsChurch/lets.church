import { describe, expect, test } from 'vitest';
import { facetMatchScore } from './facet-score';

describe('facetMatchScore', () => {
  test('exact match (case-insensitive) scores highest', () => {
    expect(facetMatchScore('Matthew', 'matthew')).toBe(1000);
    expect(facetMatchScore('1 Corinthians', '1 corinthians')).toBe(1000);
  });

  test('full-substring match scores in the middle tier', () => {
    // query is a substring of the label, but not the whole label
    expect(facetMatchScore('Matthew 10:8', 'matthew')).toBe(500);
    expect(facetMatchScore('The Dorean Principle', 'dorean')).toBe(500);
  });

  test('exact beats substring', () => {
    expect(facetMatchScore('matthew', 'matthew')).toBeGreaterThan(
      facetMatchScore('Matthew 10:8', 'matthew'),
    );
  });

  test('token overlap counts 2+ char tokens present in the label', () => {
    // neither exact nor full-substring ("matthew 10:8" isn't a substring of
    // "Matthew 10:10"); only the "matthew" token (len ≥ 2) overlaps.
    expect(facetMatchScore('Matthew 10:10', 'matthew 10:8')).toBe(1);
    // both tokens present, still token-overlap tier (not a contiguous substring)
    expect(facetMatchScore('Acts of the Apostles', 'acts apostles')).toBe(2);
  });

  test('repeated query tokens are not double-counted in the overlap tier', () => {
    // "test test test" must count the "test" token once, not three times.
    expect(facetMatchScore('A test label', 'test test test')).toBe(1);
    // distinct tokens still each count once
    expect(facetMatchScore('A test label here', 'test here here')).toBe(2);
  });

  test('1-char tokens are ignored in the overlap tier', () => {
    // the "1" must not float "1 Timothy" for a "1 corinthians" query via overlap;
    // only "corinthians" (absent here) would count, so score is 0.
    expect(facetMatchScore('1 Timothy', '1 corinthians')).toBe(0);
    // but the full "1 corinthians" query still exact/substring-matches its book
    expect(facetMatchScore('1 Corinthians', '1 corinthians')).toBe(1000);
  });

  test('no overlap scores 0', () => {
    expect(facetMatchScore('Romans', 'sourdough')).toBe(0);
  });

  test('empty or whitespace query scores 0', () => {
    expect(facetMatchScore('Matthew', '')).toBe(0);
    expect(facetMatchScore('Matthew', '   ')).toBe(0);
  });

  test('ordering: exact > token-overlap > none, so a stable sort floats the match', () => {
    const labels = ['1 Corinthians 9:10', 'Matthew 10:10', 'Matthew 10:8'];
    const q = 'matthew 10:8';
    const ranked = [...labels].sort(
      (a, b) => facetMatchScore(b, q) - facetMatchScore(a, q),
    );
    expect(ranked[0]).toBe('Matthew 10:8'); // exact (1000)
    expect(ranked[1]).toBe('Matthew 10:10'); // "matthew" token (1)
    expect(ranked[2]).toBe('1 Corinthians 9:10'); // 0
  });
});
