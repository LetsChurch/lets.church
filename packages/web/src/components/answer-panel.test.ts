import { describe, expect, it, vi } from 'vitest';

import { shouldOfferDigDeeper, streamAnswerWithRetry } from './answer-panel';

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
    const request = vi.fn(async () =>
      (async function* () {
        yield { type: 'rate-limited' as const, retryAfterSeconds: 10 };
      })(),
    );

    await expect(
      streamAnswerWithRetry(
        { query: 'Question', threadId: 'thread', resourceId: 'browser' },
        new AbortController().signal,
        vi.fn(),
        request,
      ),
    ).resolves.toBe('rate-limited');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
