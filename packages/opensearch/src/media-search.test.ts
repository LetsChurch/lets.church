import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.OPENSEARCH_URL ??= 'http://127.0.0.1:9200';
});

import type { OsMsearchItem } from './client';
import {
  type BuildMediaSearchArgs,
  buildMediaFacetBody,
  MEDIA_INDEX,
  type MediaFacetKey,
  runMediaFacets,
} from './media-search';

const baseArgs: BuildMediaSearchArgs = { lexicalText: '' };

function facetResponse(index: number) {
  return {
    timed_out: false,
    hits: { total: { value: 0, relation: 'eq' }, hits: [] },
    aggregations: {
      sample: {
        channelIds: {
          buckets: [{ key: `channel-${index}`, doc_count: index + 10 }],
        },
        speakers: {
          buckets: [{ key: `speaker-${index}`, doc_count: index + 20 }],
        },
        bibleRefs: {
          buckets: [{ key: `John.3.${index}`, doc_count: index + 30 }],
        },
        publishedYears: {
          buckets: [{ key_as_string: `200${index}`, doc_count: index + 40 }],
        },
      },
    },
  };
}

function transports(responses: unknown[], maxScore: number | null = 8) {
  const search = vi.fn(async () => ({ hits: { max_score: maxScore } }));
  const msearch = vi.fn(async () => ({ responses }));
  return { search, msearch };
}

function expectedFacetBodies(args: BuildMediaSearchArgs, minScore?: number) {
  const base = { ...args, from: 0, size: 1, highlight: false };
  const hasChannel = Boolean(args.channelIds && args.channelIds.length > 0);
  const hasSpeaker = Boolean(args.speakers && args.speakers.length > 0);
  const hasScripture = Boolean(
    (args.bibleRefs && args.bibleRefs.length > 0) ||
    (args.bibleBooks && args.bibleBooks.length > 0),
  );
  const hasDate = Boolean(
    args.publishedAt && (args.publishedAt.gte || args.publishedAt.lte),
  );
  const fullFacets: MediaFacetKey[] = [
    ...(hasChannel ? [] : (['channels'] as const)),
    ...(hasSpeaker ? [] : (['speakers'] as const)),
    ...(hasScripture ? [] : (['verses'] as const)),
    ...(hasDate ? [] : (['years'] as const)),
  ];
  const bodies = [
    buildMediaFacetBody({ ...base, facets: fullFacets }, minScore),
  ];
  if (hasChannel) {
    bodies.push(
      buildMediaFacetBody(
        { ...base, channelIds: null, facets: ['channels'] },
        minScore,
      ),
    );
  }
  if (hasSpeaker) {
    bodies.push(
      buildMediaFacetBody(
        { ...base, speakers: null, facets: ['speakers'] },
        minScore,
      ),
    );
  }
  if (hasScripture) {
    bodies.push(
      buildMediaFacetBody(
        {
          ...base,
          bibleRefs: null,
          bibleBooks: null,
          facets: ['verses'],
        },
        minScore,
      ),
    );
  }
  if (hasDate) {
    bodies.push(
      buildMediaFacetBody(
        { ...base, publishedAt: null, facets: ['years'] },
        minScore,
      ),
    );
  }
  return bodies;
}

function expectedMsearch(bodies: OsMsearchItem[]) {
  return bodies.flatMap((body) => [{ index: MEDIA_INDEX }, body]);
}

describe('runMediaFacets', () => {
  it.each([
    {
      name: 'no active dimensions',
      args: {},
      indexes: { channel: 0, speaker: 0, scripture: 0, year: 0 },
    },
    {
      name: 'channel only',
      args: { channelIds: ['channel-id'] },
      indexes: { channel: 1, speaker: 0, scripture: 0, year: 0 },
    },
    {
      name: 'speaker only',
      args: { speakers: ['Speaker'] },
      indexes: { channel: 0, speaker: 1, scripture: 0, year: 0 },
    },
    {
      name: 'scripture only',
      args: { bibleRefs: ['John.3.16'] },
      indexes: { channel: 0, speaker: 0, scripture: 1, year: 0 },
    },
    {
      name: 'year only',
      args: { publishedAt: { gte: '2020-01-01' } },
      indexes: { channel: 0, speaker: 0, scripture: 0, year: 1 },
    },
    {
      name: 'two active dimensions',
      args: { channelIds: ['channel-id'], speakers: ['Speaker'] },
      indexes: { channel: 1, speaker: 2, scripture: 0, year: 0 },
    },
    {
      name: 'three active dimensions',
      args: {
        channelIds: ['channel-id'],
        speakers: ['Speaker'],
        bibleRefs: ['John.3.16'],
      },
      indexes: { channel: 1, speaker: 2, scripture: 3, year: 0 },
    },
    {
      name: 'all active dimensions',
      args: {
        channelIds: ['channel-id'],
        speakers: ['Speaker'],
        bibleRefs: ['John.3.16'],
        bibleBooks: ['John'],
        publishedAt: { gte: '2020-01-01', lte: '2020-12-31' },
      },
      indexes: { channel: 1, speaker: 2, scripture: 3, year: 4 },
    },
  ])('batches and maps $name', async ({ args: partialArgs, indexes }) => {
    const args: BuildMediaSearchArgs = { ...baseArgs, ...partialArgs };
    const bodies = expectedFacetBodies(args);
    const transport = transports(
      bodies.map((_, index) => facetResponse(index)),
    );

    const result = await runMediaFacets(args, transport);

    expect(transport.search).not.toHaveBeenCalled();
    expect(transport.msearch).toHaveBeenCalledTimes(1);
    expect(transport.msearch).toHaveBeenCalledWith(expectedMsearch(bodies));
    expect(result).toEqual({
      channels: [
        {
          key: `channel-${indexes.channel}`,
          doc_count: indexes.channel + 10,
        },
      ],
      speakers: [
        {
          key: `speaker-${indexes.speaker}`,
          doc_count: indexes.speaker + 20,
        },
      ],
      verses: [
        {
          key: `John.3.${indexes.scripture}`,
          doc_count: indexes.scripture + 30,
        },
      ],
      years: [
        {
          year: `200${indexes.year}`,
          doc_count: indexes.year + 40,
        },
      ],
    });
  });

  it('keeps the lexical max-score probe separate from the facet batch', async () => {
    const args: BuildMediaSearchArgs = { lexicalText: 'grace' };
    const bodies = expectedFacetBodies(args, 4);
    const transport = transports([facetResponse(0)], 8);

    await runMediaFacets(args, transport);

    expect(transport.search).toHaveBeenCalledTimes(1);
    expect(transport.search).toHaveBeenCalledWith({
      index: MEDIA_INDEX,
      ...buildMediaFacetBody({
        ...args,
        from: 0,
        size: 1,
        highlight: false,
        facets: [],
      }),
    });
    expect(transport.msearch).toHaveBeenCalledTimes(1);
    expect(transport.msearch).toHaveBeenCalledWith(expectedMsearch(bodies));
  });

  it('omits the relative score floor when the probe has no max score', async () => {
    const args: BuildMediaSearchArgs = { lexicalText: 'grace' };
    const bodies = expectedFacetBodies(args);
    const transport = transports([facetResponse(0)], null);

    await runMediaFacets(args, transport);

    expect(transport.search).toHaveBeenCalledTimes(1);
    expect(transport.msearch).toHaveBeenCalledWith(expectedMsearch(bodies));
  });

  it('surfaces an individual OpenSearch item error with its index and status', async () => {
    const transport = transports([
      facetResponse(0),
      {
        status: 429,
        error: { type: 'rejected_execution_exception', reason: 'queue full' },
      },
    ]);

    await expect(
      runMediaFacets({ ...baseArgs, channelIds: ['channel-id'] }, transport),
    ).rejects.toThrow(
      'Media facet msearch item 1 failed with status 429: queue full',
    );
  });

  it('rejects malformed item responses', async () => {
    const transport = transports([{ timed_out: false, hits: null }]);

    await expect(runMediaFacets(baseArgs, transport)).rejects.toThrow(
      /Invalid media facet msearch response at responses\.0/,
    );
  });

  it('rejects timed-out item responses', async () => {
    const response = facetResponse(0);
    response.timed_out = true;
    const transport = transports([response]);

    await expect(runMediaFacets(baseArgs, transport)).rejects.toThrow(
      'Media facet msearch item 0 timed out',
    );
  });

  it('rejects a response count that does not match the body count', async () => {
    const transport = transports([]);

    await expect(runMediaFacets(baseArgs, transport)).rejects.toThrow(
      'Media facet msearch returned 0 responses for 1 bodies',
    );
  });

  it.each([
    {
      name: 'missing aggregations',
      response: {
        timed_out: false,
        hits: { total: { value: 0, relation: 'eq' }, hits: [] },
      },
    },
    {
      name: 'an empty sampler aggregation',
      response: {
        timed_out: false,
        hits: { total: { value: 0, relation: 'eq' }, hits: [] },
        aggregations: { sample: {} },
      },
    },
  ])('returns empty buckets for $name', async ({ response }) => {
    const transport = transports([response]);

    await expect(runMediaFacets(baseArgs, transport)).resolves.toEqual({
      channels: [],
      speakers: [],
      verses: [],
      years: [],
    });
  });
});
