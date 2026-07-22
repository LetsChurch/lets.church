import { describe, expect, it } from 'vitest';

import { shouldOfferDigDeeper } from './answer-panel';

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
    expect(shouldOfferDigDeeper('done', true, 'Answer')).toBe(false);
    expect(shouldOfferDigDeeper('done', false, '')).toBe(false);
  });
});
