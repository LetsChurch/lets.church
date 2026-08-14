import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.OPENSEARCH_URL ??= 'http://127.0.0.1:1';
});

// The OpenSearch client validates OPENSEARCH_URL at module initialization, so
// import only after the hoisted test URL is installed; no real request is sent.

const {
  MEDIA_SEARCH_MAX_CANDIDATES,
  MEDIA_SEARCH_MAX_OFFSET,
  MEDIA_SEARCH_MAX_PAGE_SIZE,
  MediaSearchPaginationSchema,
  runMediaHybridSearch,
} = await import('@letschurch/opensearch');

describe('media search pagination input', () => {
  it('accepts each boundary and the exact candidate ceiling', () => {
    expect(
      MediaSearchPaginationSchema.parse({
        cursor: 0,
        limit: MEDIA_SEARCH_MAX_PAGE_SIZE,
      }),
    ).toEqual({ cursor: 0, limit: MEDIA_SEARCH_MAX_PAGE_SIZE });
    expect(
      MediaSearchPaginationSchema.parse({
        cursor: MEDIA_SEARCH_MAX_OFFSET,
        limit: 1,
      }),
    ).toEqual({ cursor: MEDIA_SEARCH_MAX_OFFSET, limit: 1 });
    expect(
      MediaSearchPaginationSchema.parse({ cursor: 40, limit: 20 }),
    ).toEqual({ cursor: 40, limit: 20 });
  });

  it.each([
    { cursor: MEDIA_SEARCH_MAX_OFFSET + 1, limit: 1 },
    { cursor: -1, limit: 1 },
    { cursor: 0.5, limit: 1 },
    { cursor: Number.NaN, limit: 1 },
    { cursor: 'NaN', limit: 1 },
    { cursor: 0, limit: MEDIA_SEARCH_MAX_PAGE_SIZE + 1 },
    { cursor: 50, limit: 11 },
  ])('rejects invalid input %#', (input) => {
    expect(MediaSearchPaginationSchema.safeParse(input).success).toBe(false);
  });
});

type SearchResponse = {
  hits: {
    total: { value: number; relation: string };
    hits: Array<{ _id: string; _score: number | null }>;
  };
};

function response(
  hits: Array<{ _id: string; _score: number | null }>,
): SearchResponse {
  return {
    hits: {
      total: { value: hits.length, relation: 'eq' },
      hits,
    },
  };
}

describe('OpenSearch pagination boundary', () => {
  it('rejects invalid windows before making any downstream call', async () => {
    const search = vi.fn(async () => response([]));
    const msearch = vi.fn(async () => ({ responses: [] }));

    for (const pagination of [
      { from: -1, size: 1 },
      { from: 0.5, size: 1 },
      { from: 0, size: MEDIA_SEARCH_MAX_PAGE_SIZE + 1 },
      { from: 50, size: 11 },
      { from: MEDIA_SEARCH_MAX_OFFSET + 1, size: 1 },
      { from: 0, size: Number.NaN },
    ]) {
      await expect(
        runMediaHybridSearch(
          { lexicalText: 'grace', ...pagination },
          { search, msearch },
        ),
      ).rejects.toBeInstanceOf(RangeError);
    }

    expect(search).not.toHaveBeenCalled();
    expect(msearch).not.toHaveBeenCalled();
  });

  it('bounds an accepted hybrid request and preserves page slicing', async () => {
    const candidates = Array.from(
      { length: MEDIA_SEARCH_MAX_CANDIDATES },
      (_, index) => ({ _id: `hit-${index}`, _score: 1 - index / 100 }),
    );
    const expectedPage = candidates.slice(40, 60);
    const search = vi
      .fn()
      .mockResolvedValueOnce(response(candidates))
      .mockResolvedValueOnce(response(expectedPage));
    const msearch = vi.fn(async () => ({
      responses: [response(candidates), response(candidates)],
    }));

    const result = await runMediaHybridSearch(
      {
        lexicalText: 'grace',
        queryVector: [0.5],
        from: 40,
        size: 20,
      },
      { search, msearch },
    );

    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[0]?.[0]).toMatchObject({
      from: 0,
      size: MEDIA_SEARCH_MAX_CANDIDATES,
    });
    expect(
      search.mock.calls.every(
        ([request]) =>
          typeof request.size !== 'number' ||
          request.size <= MEDIA_SEARCH_MAX_CANDIDATES,
      ),
    ).toBe(true);
    expect(msearch).toHaveBeenCalledTimes(1);
    expect(result.hits.map((hit) => hit._id)).toEqual(
      expectedPage.map((hit) => hit._id),
    );
  });
});
