import { afterEach, describe, expect, it, vi } from 'vitest';

import { shouldOfferDigDeeper, streamAnswerWithRetry } from './answer-panel';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shouldOfferDigDeeper', () => {
  it('offers chat continuation for every settled non-facet answer', () => {
    expect(shouldOfferDigDeeper('done', false, 'An auto-dug answer.')).toBe(
      true,
    );
  });

  it('does not offer continuation while loading, after errors, or for facets', () => {
    expect(shouldOfferDigDeeper('streaming', false, 'Answer')).toBe(false);
    expect(shouldOfferDigDeeper('error', false, 'Answer')).toBe(false);
    expect(shouldOfferDigDeeper('cancelled', false, 'Answer')).toBe(false);
    expect(shouldOfferDigDeeper('rate-limited', false, 'Answer')).toBe(false);
    expect(shouldOfferDigDeeper('done', true, 'Answer')).toBe(false);
    expect(shouldOfferDigDeeper('done', false, '')).toBe(false);
  });

  it('does not retry an intentional rate-limit response', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('Slow down', {
          status: 429,
          headers: { 'Retry-After': '10' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      streamAnswerWithRetry(
        { query: 'Question' },
        new AbortController().signal,
        vi.fn(),
      ),
    ).resolves.toBe('rate-limited');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
