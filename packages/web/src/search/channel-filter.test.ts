import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.OPENSEARCH_URL ??= 'http://127.0.0.1:1';
});

// Delay import until its required test-only client URL exists; no request is sent.
const { buildMediaHybridBody } = await import('@letschurch/opensearch');

function getFilters(channelIds?: string[] | null): unknown[] {
  const body = buildMediaHybridBody({ lexicalText: 'grace', channelIds });
  const query = body.query as { bool: { filter: unknown[] } };
  return query.bool.filter;
}

describe('media search channel filters', () => {
  it('does not add a channel clause when the filter is absent', () => {
    expect(getFilters()).not.toContainEqual({
      terms: { channelId: expect.anything() },
    });
  });

  it('adds a terms clause for a non-empty channel filter', () => {
    const channelId = '5c452ea0-103a-4a4c-aacc-3644472969df';

    expect(getFilters([channelId])).toContainEqual({
      terms: { channelId: [channelId] },
    });
  });

  it('cannot match when the channel filter is explicitly empty', () => {
    expect(getFilters([])).toContainEqual({ match_none: {} });
  });
});
