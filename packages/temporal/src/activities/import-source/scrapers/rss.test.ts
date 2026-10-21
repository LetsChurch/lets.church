import { describe, expect, test, vi } from 'vitest';

vi.mock('../../../util/logger', () => ({
  default: {
    child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  },
}));

import { feedLicense, orderFeedItems } from './rss';

describe('feedLicense', () => {
  test.each([
    [['CC0-1.0'], 'CC0'],
    [['https://creativecommons.org/publicdomain/zero/1.0/'], 'CC0'],
    [['CC0 1.0: dedicated to the public domain'], 'CC0'],
    [['Public Domain'], 'PUBLIC_DOMAIN'],
    [['CC-BY-4.0'], 'CC_BY'],
    [['https://creativecommons.org/licenses/by/4.0/'], 'CC_BY'],
    [['CC BY-SA 4.0'], 'CC_BY_SA'],
    [['CC-BY-NC-4.0'], 'CC_BY_NC'],
    [['cc-by-nc-sa-4.0'], 'CC_BY_NC_SA'],
    [['https://creativecommons.org/licenses/by-nd/4.0/'], 'CC_BY_ND'],
    [['CC BY-NC-ND 4.0'], 'CC_BY_NC_ND'],
  ])('%j → %s', (declarations, expected) => {
    expect(feedLicense(declarations)).toBe(expected);
  });

  test('ignores plain copyright notices', () => {
    expect(feedLicense(['© 2024 Grace Church. All rights reserved.'])).toBe(
      null,
    );
    expect(feedLicense([null, undefined, ''])).toBe(null);
  });

  test('uses the first recognizable declaration', () => {
    expect(feedLicense([null, '© 2024 Someone', 'CC-BY-SA-4.0'])).toBe(
      'CC_BY_SA',
    );
  });
});

describe('orderFeedItems', () => {
  const item = (title: string, extra: object = {}) => ({
    url: `https://example.com/${title}.mp3`,
    title,
    ...extra,
  });

  test('sorts by episode number when every item has one', () => {
    const ordered = orderFeedItems([
      item('b', { episode: 2, publishedAt: '2020-01-01' }),
      item('c', { episode: 10, publishedAt: '2019-01-01' }),
      item('a', { episode: 1, publishedAt: '2021-01-01' }),
    ]);
    expect(ordered.map((i) => i.title)).toEqual(['a', 'b', 'c']);
  });

  test('orders by season before episode number', () => {
    const ordered = orderFeedItems([
      item('s2e1', { season: 2, episode: 1 }),
      item('s1e2', { season: 1, episode: 2 }),
      item('s2e2', { season: 2, episode: 2 }),
      item('s1e1', { season: 1, episode: 1 }),
    ]);
    expect(ordered.map((i) => i.title)).toEqual([
      's1e1',
      's1e2',
      's2e1',
      's2e2',
    ]);
  });

  test('falls back to oldest-first publish date', () => {
    const ordered = orderFeedItems([
      item('new', { episode: 3, publishedAt: '2024-03-01T00:00:00Z' }),
      item('old', { publishedAt: '2024-01-01T00:00:00Z' }),
      item('mid', { publishedAt: new Date('2024-02-01T00:00:00Z') }),
    ]);
    expect(ordered.map((i) => i.title)).toEqual(['old', 'mid', 'new']);
  });

  test('otherwise reverses document order (feeds list newest first)', () => {
    const ordered = orderFeedItems([
      item('third'),
      item('second', { publishedAt: '2024-01-01' }),
      item('first'),
    ]);
    expect(ordered.map((i) => i.title)).toEqual(['first', 'second', 'third']);
  });
});
