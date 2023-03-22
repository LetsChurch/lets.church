import { describe, test, expect } from 'vitest';
import { adjacentPairs } from './misc';

describe('adjacentPairs', () => {
  test('one element', () => {
    expect(adjacentPairs([1])).toMatchInlineSnapshot(`
      [
        [
          1,
        ],
      ]
    `);
  });

  test('two elements', () => {
    expect(adjacentPairs([1, 2])).toMatchInlineSnapshot(`
      [
        [
          1,
          2,
        ],
      ]
    `);
  });

  test('three elements', () => {
    expect(adjacentPairs([1, 2, 3])).toMatchInlineSnapshot(`
      [
        [
          1,
          2,
        ],
        [
          2,
          3,
        ],
      ]
    `);
  });

  test('four elements', () => {
    expect(adjacentPairs([1, 2, 3, 4])).toMatchInlineSnapshot(`
      [
        [
          1,
          2,
        ],
        [
          2,
          3,
        ],
        [
          3,
          4,
        ],
      ]
    `);
  });

  test('five elements', () => {
    expect(adjacentPairs([1, 2, 3, 4, 5])).toMatchInlineSnapshot(`
      [
        [
          1,
          2,
        ],
        [
          2,
          3,
        ],
        [
          3,
          4,
        ],
        [
          4,
          5,
        ],
      ]
    `);
  });

  test('six elements', () => {
    expect(adjacentPairs([1, 2, 3, 4, 5, 6])).toMatchInlineSnapshot(`
      [
        [
          1,
          2,
        ],
        [
          2,
          3,
        ],
        [
          3,
          4,
        ],
        [
          4,
          5,
        ],
        [
          5,
          6,
        ],
      ]
    `);
  });

  test('seven elements', () => {
    expect(adjacentPairs([1, 2, 3, 4, 5, 6, 7])).toMatchInlineSnapshot(`
      [
        [
          1,
          2,
        ],
        [
          2,
          3,
        ],
        [
          3,
          4,
        ],
        [
          4,
          5,
        ],
        [
          5,
          6,
        ],
        [
          6,
          7,
        ],
      ]
    `);
  });

  test('eight elements', () => {
    expect(adjacentPairs([1, 2, 3, 4, 5, 6, 7, 8])).toMatchInlineSnapshot(`
      [
        [
          1,
          2,
        ],
        [
          2,
          3,
        ],
        [
          3,
          4,
        ],
        [
          4,
          5,
        ],
        [
          5,
          6,
        ],
        [
          6,
          7,
        ],
        [
          7,
          8,
        ],
      ]
    `);
  });

  test('nine elements', () => {
    expect(adjacentPairs([1, 2, 3, 4, 5, 6, 7, 8, 9])).toMatchInlineSnapshot(`
      [
        [
          1,
          2,
        ],
        [
          2,
          3,
        ],
        [
          3,
          4,
        ],
        [
          4,
          5,
        ],
        [
          5,
          6,
        ],
        [
          6,
          7,
        ],
        [
          7,
          8,
        ],
        [
          8,
          9,
        ],
      ]
    `);
  });
});
