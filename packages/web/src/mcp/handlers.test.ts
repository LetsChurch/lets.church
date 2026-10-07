import { beforeAll, describe, expect, it, vi } from 'vitest';

const osSearch = vi.fn();
vi.mock('@letschurch/opensearch', () => ({
  MEDIA_INDEX: 'lc_media_v1',
  MEDIA_SEARCH_MAX_CANDIDATES: 60,
  osSearch: (...args: unknown[]) => osSearch(...args),
}));

let handlers: typeof import('./handlers');

beforeAll(async () => {
  vi.stubEnv('WEB_URL', 'https://lets.church');
  handlers = await import('./handlers');
});

const MEDIA_ID = '111111114Ay6byyrXg5r6J';

type Caller = Parameters<typeof handlers.getSermon>[0];
// Only the procedures each test touches are stubbed.
const fakeCaller = (impl: Record<string, Record<string, unknown>>) =>
  impl as unknown as Caller;

describe('get_sermon', () => {
  it('merges media details with the index rollups and links timestamps', async () => {
    osSearch.mockResolvedValueOnce({
      hits: {
        hits: [
          {
            _source: {
              speakers: ['Andrew Case'],
              bibleRefs: ['Matt.10.8', '1Tim.5.18'],
            },
          },
        ],
      },
    });
    const caller = fakeCaller({
      media: {
        getMediaById: vi.fn(async () => ({
          id: MEDIA_ID,
          title: 'The Dorean Principle in Five Minutes',
          publishedAt: new Date('2026-09-02T23:33:47.491Z'),
          lengthSeconds: 328.26,
          channel: { slug: 'selling-jesus', name: 'Selling Jesus' },
          transcribingFinishedAt: new Date(),
          isLive: false,
          viewCount: 12,
          description: 'desc',
          summary: 'sum',
          license: 'CC-BY-4.0',
          outline: [
            {
              title: 'Intro',
              description: null,
              startSeconds: 61.9,
              endSeconds: 120,
            },
          ],
          series: { id: 'seriesId', title: 'A Series' },
        })),
      },
    });

    const sermon = await handlers.getSermon(caller, { id: MEDIA_ID });

    expect(sermon).toMatchObject({
      url: `https://lets.church/media/${MEDIA_ID}`,
      channel: { url: 'https://lets.church/channel/selling-jesus' },
      publishedAt: '2026-09-02T23:33:47.491Z',
      speakers: ['Andrew Case'],
      hasTranscript: true,
      scriptureRefs: [
        { ref: 'Matt.10.8', label: 'Matthew 10:8' },
        { ref: '1Tim.5.18', label: '1 Timothy 5:18' },
      ],
      series: { url: 'https://lets.church/series/seriesId' },
    });
    expect(sermon.outline[0]?.url).toBe(
      `https://lets.church/media/${MEDIA_ID}#t=61`,
    );
  });

  it('still answers when the index lookup fails', async () => {
    osSearch.mockRejectedValueOnce(new Error('opensearch down'));
    const caller = fakeCaller({
      media: {
        getMediaById: vi.fn(async () => ({
          id: MEDIA_ID,
          title: 't',
          publishedAt: null,
          lengthSeconds: null,
          channel: { slug: 's', name: 'S' },
          transcribingFinishedAt: null,
          isLive: false,
          viewCount: 0,
          description: null,
          summary: null,
          license: null,
          outline: [],
          series: null,
        })),
      },
    });
    const sermon = await handlers.getSermon(caller, { id: MEDIA_ID });
    expect(sermon.speakers).toEqual([]);
    expect(sermon.scriptureRefs).toEqual([]);
  });

  it('reports unknown and unviewable media as a tool error', async () => {
    osSearch.mockResolvedValueOnce({ hits: { hits: [] } });
    const caller = fakeCaller({
      media: { getMediaById: vi.fn(async () => null) },
    });
    await expect(
      handlers.getSermon(caller, { id: MEDIA_ID }),
    ).rejects.toBeInstanceOf(handlers.ToolError);
    await expect(
      handlers.getSermon(caller, { id: 'not an id!' }),
    ).rejects.toBeInstanceOf(handlers.ToolError);
  });
});

describe('get_transcript', () => {
  const paragraphs = Array.from({ length: 10 }, (_, order) => ({
    order,
    start: order * 10,
    end: order * 10 + 10,
    speaker: 'SPEAKER_00',
    speakerName: 'Andrew Case',
    text: `paragraph ${order}`,
    words: [],
    annotations:
      order === 3
        ? [
            {
              kind: 'OUTLINE',
              startWord: null,
              endWord: null,
              metadata: { title: 'Point one' },
            },
            {
              kind: 'BIBLE',
              startWord: 1,
              endWord: 2,
              metadata: { book: 'Matt', chapter: 10, verse: 8 },
            },
          ]
        : [],
  }));
  const caller = fakeCaller({
    media: {
      // Deliberately out of order: the handler sorts by paragraph number.
      getTranscriptParagraphs: vi.fn(async () => [...paragraphs].reverse()),
    },
  });

  it('pages by paragraph and reports where to continue', async () => {
    const page = await handlers.getTranscript(caller, {
      id: MEDIA_ID,
      fromParagraph: 2,
      maxParagraphs: 3,
    });
    expect(page.paragraphs.map((p) => p.paragraph)).toEqual([2, 3, 4]);
    expect(page.nextParagraph).toBe(5);
    expect(page.totalParagraphs).toBe(10);
    expect(page.scriptureRefs).toEqual([
      { ref: 'Matt.10.8', label: 'Matthew 10:8', paragraph: 3 },
    ]);
    // The outline covers the whole sermon, not just the window.
    expect(page.outline).toEqual([
      {
        title: 'Point one',
        paragraph: 3,
        startSec: 30,
        url: `https://lets.church/media/${MEDIA_ID}#t=30`,
      },
    ]);
  });

  it('starts at the paragraph playing at fromSec and ends cleanly', async () => {
    const page = await handlers.getTranscript(caller, {
      id: MEDIA_ID,
      fromSec: 85,
      maxParagraphs: 40,
    });
    expect(page.paragraphs.map((p) => p.paragraph)).toEqual([8, 9]);
    expect(page.nextParagraph).toBeNull();
  });

  it('rejects ambiguous windows', async () => {
    await expect(
      handlers.getTranscript(caller, {
        id: MEDIA_ID,
        fromSec: 1,
        fromParagraph: 1,
        maxParagraphs: 40,
      }),
    ).rejects.toThrow('not both');
  });
});

describe('find_churches', () => {
  it('formats meeting addresses and sorts by computed distance', async () => {
    const church = (slug: string, latitude: number | null) => ({
      slug,
      name: slug,
      websiteUrl: null,
      addresses: [
        {
          streetAddress: '1 Main St',
          locality: 'Town',
          region: 'CA',
          postalCode: '90000',
          country: 'United States',
          latitude,
          longitude: latitude === null ? null : -118.24,
        },
      ],
      tags: [{ slug: 'baptist', label: 'Baptist', category: 'DENOMINATION' }],
    });
    const caller = fakeCaller({
      church: {
        searchChurches: vi.fn(async () => ({
          items: [
            church('far', 34.5),
            church('unknown', null),
            church('near', 34.1),
          ],
          total: 3,
        })),
      },
    });

    const { churches } = await handlers.findChurches(caller, {
      lat: 34.05,
      lon: -118.24,
      radiusMiles: 50,
      limit: 15,
    });

    expect(churches.map((c) => c.slug)).toEqual(['near', 'far', 'unknown']);
    expect(churches[0]?.distanceMiles).toBeCloseTo(3.5, 0);
    expect(churches[0]?.address).toBe(
      '1 Main St, Town, CA, 90000, United States',
    );
    expect(churches[2]).toMatchObject({ address: null, distanceMiles: null });
  });
});

describe('search snippets', () => {
  it('strips highlight tags and decodes the highlighter’s HTML escaping', () => {
    expect(
      handlers.snippetToPlainText(
        'I&#x27;m <mark>called</mark> &amp; &quot;sent&quot; &lt;3 &#8212; &#x2F;',
      ),
    ).toBe('I\'m called & "sent" <3 — /');
    // Decoding happens once: an escaped entity stays literal text.
    expect(handlers.snippetToPlainText('&amp;lt;')).toBe('&lt;');
    expect(handlers.snippetToPlainText('&bogus; &#0;')).toBe('&bogus; &#0;');
  });
});
