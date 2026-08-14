import type { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Context } from '@/trpc/context';

import { router } from '../trpc';
import {
  hybridSearchSchema,
  SEARCH_FACET_CHANNEL_MAX_ITEMS,
  SEARCH_FACET_CHANNEL_NAME_MAX_LENGTH,
  SEARCH_FACET_SPEAKER_MAX_ITEMS,
  SEARCH_FACET_SPEAKER_MAX_LENGTH,
  SEARCH_FILTER_MAX_ITEMS,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_SUGGEST_CONTEXT_ITEM_MAX_LENGTH,
  SEARCH_SUGGEST_CONTEXT_MAX_ITEMS,
  searchMetaSchema,
  searchProcedures,
  suggestQueriesSchema,
  warmEmbedSchema,
} from './search';

const mocks = vi.hoisted(() => ({
  enforceAiRateLimit: vi.fn(),
  generateQuerySuggestions: vi.fn(),
  enforceSearchRateLimit: vi.fn(),
  generateRelatedSearches: vi.fn(),
  getQueryEmbeddingCached: vi.fn(),
  parseSearchQuery: vi.fn(),
  shouldWarmEmbed: vi.fn(),
}));

vi.mock('@letschurch/db', () => ({ db: {}, SearchLogEntry: {} }));
vi.mock('@letschurch/opensearch', () => {
  return {
    MEDIA_SEARCH_MAX_CANDIDATES: 60,
    MediaSearchPaginationSchema: z.object({
      cursor: z.number().int().nonnegative().max(59).default(0),
      limit: z.number().int().min(1).max(20).default(20),
    }),
    MSearchResponseSchema: { parse: vi.fn() },
    mergeParagraphSnippets: vi.fn(),
    msearchChannels: vi.fn(),
    osMsearch: vi.fn(),
    runMediaFacets: vi.fn(),
    runMediaFilterSearch: vi.fn(),
    runMediaHybridSearch: vi.fn(),
    suggestMediaPalette: vi.fn(),
  };
});
vi.mock('@letschurch/s3/public', () => ({ publicS3: {} }));
vi.mock('@/ai/abuse-control', () => ({
  enforceAiRateLimit: mocks.enforceAiRateLimit,
}));
vi.mock('@/util/logger', () => ({
  default: {
    child: () => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));
vi.mock('@/util/query-embed', () => ({
  getQueryEmbeddingCached: mocks.getQueryEmbeddingCached,
  shouldWarmEmbed: mocks.shouldWarmEmbed,
}));
vi.mock('@/util/search-rate-limit', () => ({
  enforceSearchRateLimit: mocks.enforceSearchRateLimit,
}));
vi.mock('@/util/server-env', () => ({ getPublicImageUrl: vi.fn() }));
vi.mock('../search/parse-query', () => ({
  extractQuotedPhrases: vi.fn(() => []),
  parseSearchQuery: mocks.parseSearchQuery,
}));
vi.mock('../search/query-suggestions', () => ({
  generateQuerySuggestions: mocks.generateQuerySuggestions,
}));
vi.mock('../search/related-searches', () => ({
  generateRelatedSearches: mocks.generateRelatedSearches,
}));

const searchRouter = router(searchProcedures);

function callerContext(options?: {
  authenticated?: boolean;
  clientIp?: string;
}): Context {
  return {
    isSiteAdmin: true,
    req: new Request('http://localhost/trpc', {
      headers: options?.clientIp
        ? { 'X-Forwarded-For': options.clientIp }
        : undefined,
    }),
    resHeaders: new Headers(),
    session: options?.authenticated
      ? ({ appUserId: 'authenticated-user' } as Context['session'])
      : null,
  } as Context;
}

const emptyParse = {
  channels: [],
  dateLabel: null,
  dateRange: null,
  dates: null,
  questions: [],
  speakers: [],
};

describe('public search model admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceAiRateLimit.mockResolvedValue({ allowed: true });
    mocks.enforceSearchRateLimit.mockResolvedValue({ allowed: true });
    mocks.generateQuerySuggestions.mockResolvedValue(['a suggestion']);
    mocks.generateRelatedSearches.mockResolvedValue(['a related search']);
    mocks.getQueryEmbeddingCached.mockResolvedValue([0.1, 0.2]);
    mocks.parseSearchQuery.mockResolvedValue(emptyParse);
    mocks.shouldWarmEmbed.mockReturnValue(true);
  });

  it('admits anonymous metadata before either cached model helper', async () => {
    const ctx = callerContext({ clientIp: '203.0.113.7' });

    await expect(
      searchRouter.createCaller(ctx).searchMeta({
        q: '  Grace   and Truth ',
        facetChannels: [{ slug: 'example', name: 'Example Church' }],
      }),
    ).resolves.toEqual({
      relatedSearches: ['a related search'],
      parsed: {
        questions: [],
        speakers: [],
        matchedSpeakers: [],
        matchedChannels: [],
        dateRange: null,
        dates: null,
        dateLabel: null,
      },
    });

    expect(mocks.enforceAiRateLimit).toHaveBeenCalledWith({
      headers: ctx.req.headers,
      kind: 'search-meta',
      resourceId:
        '["search-meta","grace and truth",[["channels",["example church"]]]]',
    });
    expect(mocks.enforceAiRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.parseSearchQuery.mock.invocationCallOrder[0],
    );
    expect(mocks.enforceAiRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generateRelatedSearches.mock.invocationCallOrder[0],
    );
  });

  it('rejects anonymous metadata without invoking model or cache helpers', async () => {
    mocks.enforceAiRateLimit.mockResolvedValue({
      allowed: false,
      limitedBy: 'resource',
      retryAfterSeconds: 19,
    });
    const ctx = callerContext({ clientIp: '203.0.113.8' });

    await expect(
      searchRouter.createCaller(ctx).searchMeta({ q: 'grace' }),
    ).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many searches. Wait a moment and try again.',
    } satisfies Partial<TRPCError>);
    expect(ctx.resHeaders.get('Cache-Control')).toBe('no-store');
    expect(ctx.resHeaders.get('Retry-After')).toBe('19');
    expect(mocks.parseSearchQuery).not.toHaveBeenCalled();
    expect(mocks.generateRelatedSearches).not.toHaveBeenCalled();
  });

  it('admits every warm-cache access, including a repeat of the same query', async () => {
    const ctx = callerContext({ clientIp: '198.51.100.4' });
    const caller = searchRouter.createCaller(ctx);

    await expect(caller.warmEmbed({ q: 'What is grace?' })).resolves.toEqual({
      warmed: true,
    });
    await expect(caller.warmEmbed({ q: ' what  IS grace? ' })).resolves.toEqual(
      {
        warmed: true,
      },
    );

    expect(mocks.enforceAiRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.getQueryEmbeddingCached).toHaveBeenCalledTimes(2);
    expect(
      mocks.enforceAiRateLimit.mock.calls.map(
        ([request]) => request.resourceId,
      ),
    ).toEqual([
      '["search-warm-embed","what is grace?",[]]',
      '["search-warm-embed","what is grace?",[]]',
    ]);
    for (let index = 0; index < 2; index += 1) {
      expect(
        mocks.enforceAiRateLimit.mock.invocationCallOrder[index],
      ).toBeLessThan(
        mocks.getQueryEmbeddingCached.mock.invocationCallOrder[index],
      );
    }
  });

  it('rejects a warm embed before touching the embedding cache', async () => {
    mocks.enforceAiRateLimit.mockResolvedValue({
      allowed: false,
      limitedBy: 'ip',
      retryAfterSeconds: 7,
    });
    const ctx = callerContext({ clientIp: '198.51.100.5' });

    await expect(
      searchRouter.createCaller(ctx).warmEmbed({ q: 'What is grace?' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(mocks.getQueryEmbeddingCached).not.toHaveBeenCalled();
    expect(ctx.resHeaders.get('Cache-Control')).toBe('no-store');
    expect(ctx.resHeaders.get('Retry-After')).toBe('7');
  });

  it('charges a deep hybrid embedding before downstream search work', async () => {
    mocks.enforceAiRateLimit.mockResolvedValue({
      allowed: false,
      limitedBy: 'resource',
      retryAfterSeconds: 13,
    });
    const ctx = callerContext({ clientIp: '198.51.100.6' });

    await expect(
      searchRouter.createCaller(ctx).hybridSearch({
        q: 'What is grace?',
        deep: true,
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(mocks.enforceAiRateLimit).toHaveBeenCalledWith({
      headers: ctx.req.headers,
      kind: 'search-embed',
      resourceId: '["search-embed","what is grace?",[]]',
    });
    expect(mocks.getQueryEmbeddingCached).not.toHaveBeenCalled();
    expect(ctx.resHeaders.get('Cache-Control')).toBe('no-store');
    expect(ctx.resHeaders.get('Retry-After')).toBe('13');
  });

  it('rejects suggestions before invoking the completion cache helper', async () => {
    mocks.enforceAiRateLimit.mockResolvedValue({
      allowed: false,
      limitedBy: 'resource',
      retryAfterSeconds: 11,
    });
    const ctx = callerContext({ clientIp: '192.0.2.9' });

    await expect(
      searchRouter.createCaller(ctx).suggestQueries({
        q: 'grace',
        context: { channels: ['Example Church'] },
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(mocks.generateQuerySuggestions).not.toHaveBeenCalled();
    expect(ctx.resHeaders.get('Cache-Control')).toBe('no-store');
    expect(ctx.resHeaders.get('Retry-After')).toBe('11');
  });

  it('uses the resource bucket when the request has no client IP', async () => {
    const ctx = callerContext();

    await searchRouter.createCaller(ctx).suggestQueries({
      q: 'grace',
      context: { speakers: ['Jane Doe'] },
    });

    expect(mocks.enforceAiRateLimit).toHaveBeenCalledWith({
      headers: ctx.req.headers,
      kind: 'search-suggest',
      resourceId:
        '["search-suggest","grace",[["titles",[]],["channels",[]],["speakers",["jane doe"]],["books",[]]]]',
    });
  });

  it('keeps authenticated model-backed search calls outside anonymous buckets', async () => {
    const ctx = callerContext({ authenticated: true });

    await expect(
      searchRouter.createCaller(ctx).suggestQueries({
        q: 'grace',
        context: { books: ['Romans'] },
      }),
    ).resolves.toEqual({ suggestions: ['a suggestion'] });
    expect(mocks.enforceAiRateLimit).not.toHaveBeenCalled();
    expect(mocks.generateQuerySuggestions).toHaveBeenCalledOnce();
  });

  it('rejects schema-invalid model input before admission or helper work', async () => {
    const ctx = callerContext({ clientIp: '192.0.2.10' });

    await expect(
      searchRouter.createCaller(ctx).warmEmbed({
        q: 'q'.repeat(SEARCH_QUERY_MAX_LENGTH + 1),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.enforceAiRateLimit).not.toHaveBeenCalled();
    expect(mocks.getQueryEmbeddingCached).not.toHaveBeenCalled();
  });
});

describe('public search input bounds', () => {
  it('accepts exact query maxima and rejects max plus one', () => {
    for (const schema of [
      hybridSearchSchema,
      searchMetaSchema,
      warmEmbedSchema,
      suggestQueriesSchema,
    ]) {
      expect(
        schema.safeParse({ q: 'q'.repeat(SEARCH_QUERY_MAX_LENGTH) }).success,
      ).toBe(true);
      expect(
        schema.safeParse({ q: 'q'.repeat(SEARCH_QUERY_MAX_LENGTH + 1) })
          .success,
      ).toBe(false);
    }
  });

  it('bounds metadata facet arrays and their strings at measured UI sizes', () => {
    const facetChannel = { slug: 'channel', name: 'Channel' };
    const exact = {
      q: 'grace',
      facetChannels: Array.from(
        { length: SEARCH_FACET_CHANNEL_MAX_ITEMS },
        () => facetChannel,
      ),
      facetSpeakers: Array.from(
        { length: SEARCH_FACET_SPEAKER_MAX_ITEMS },
        () => 'Speaker',
      ),
    };
    expect(searchMetaSchema.safeParse(exact).success).toBe(true);
    expect(
      searchMetaSchema.safeParse({
        ...exact,
        facetChannels: [...exact.facetChannels, facetChannel],
      }).success,
    ).toBe(false);
    expect(
      searchMetaSchema.safeParse({
        ...exact,
        facetSpeakers: [...exact.facetSpeakers, 'Speaker'],
      }).success,
    ).toBe(false);
    expect(
      searchMetaSchema.safeParse({
        q: 'grace',
        facetChannels: [
          {
            slug: 'channel',
            name: 'n'.repeat(SEARCH_FACET_CHANNEL_NAME_MAX_LENGTH + 1),
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      searchMetaSchema.safeParse({
        q: 'grace',
        facetSpeakers: ['s'.repeat(SEARCH_FACET_SPEAKER_MAX_LENGTH + 1)],
      }).success,
    ).toBe(false);
  });

  it('bounds every suggestion grounding array and item', () => {
    const exactItems = Array.from(
      { length: SEARCH_SUGGEST_CONTEXT_MAX_ITEMS },
      () => 'x'.repeat(SEARCH_SUGGEST_CONTEXT_ITEM_MAX_LENGTH),
    );
    const context = {
      titles: exactItems,
      channels: exactItems,
      speakers: exactItems,
      books: exactItems,
    };
    expect(
      suggestQueriesSchema.safeParse({ q: 'grace', context }).success,
    ).toBe(true);

    for (const key of Object.keys(context) as Array<keyof typeof context>) {
      expect(
        suggestQueriesSchema.safeParse({
          q: 'grace',
          context: { ...context, [key]: [...exactItems, 'overflow'] },
        }).success,
      ).toBe(false);
      expect(
        suggestQueriesSchema.safeParse({
          q: 'grace',
          context: {
            ...context,
            [key]: ['x'.repeat(SEARCH_SUGGEST_CONTEXT_ITEM_MAX_LENGTH + 1)],
          },
        }).success,
      ).toBe(false);
    }
  });

  it('accepts the search bar payload and bounds hybrid channel and speaker facets', () => {
    expect(
      suggestQueriesSchema.safeParse({
        q: 'grace',
        context: {
          channels: Array.from({ length: 5 }, (_, index) => `Channel ${index}`),
          speakers: Array.from({ length: 5 }, (_, index) => `Speaker ${index}`),
          books: Array.from({ length: 5 }, (_, index) => `Book ${index}`),
        },
      }).success,
    ).toBe(true);
    expect(
      hybridSearchSchema.safeParse({
        q: 'grace',
        channelSlugs: Array.from(
          { length: SEARCH_FILTER_MAX_ITEMS },
          () => 'channel',
        ),
        speakers: Array.from(
          { length: SEARCH_FILTER_MAX_ITEMS },
          () => 'Speaker',
        ),
      }).success,
    ).toBe(true);
    expect(
      hybridSearchSchema.safeParse({
        q: 'grace',
        channelSlugs: Array.from(
          { length: SEARCH_FILTER_MAX_ITEMS + 1 },
          () => 'channel',
        ),
      }).success,
    ).toBe(false);
    expect(
      hybridSearchSchema.safeParse({
        q: 'grace',
        speakers: Array.from(
          { length: SEARCH_FILTER_MAX_ITEMS + 1 },
          () => 'Speaker',
        ),
      }).success,
    ).toBe(false);
  });
});
