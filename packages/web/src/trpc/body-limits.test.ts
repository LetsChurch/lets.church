import { describe, expect, it } from 'vitest';

import {
  DIG_DEEPER_MAX_BODY_BYTES,
  SEARCH_ANSWER_MAX_BODY_BYTES,
  trpcMaxBodyBytes,
  WEB_TRPC_MAX_BODY_BYTES,
} from './body-limits';

const url = (path: string) => `https://lets.church/trpc/${path}?batch=1`;

describe('trpcMaxBodyBytes', () => {
  it('caps a request that only calls a capped procedure', () => {
    expect(trpcMaxBodyBytes(url('search.answer'))).toBe(
      SEARCH_ANSWER_MAX_BODY_BYTES,
    );
    expect(trpcMaxBodyBytes(url('search.digDeeper'))).toBe(
      DIG_DEEPER_MAX_BODY_BYTES,
    );
  });

  it('sums the caps of a batch of capped procedures', () => {
    expect(trpcMaxBodyBytes(url('search.answer,search.answer'))).toBe(
      2 * SEARCH_ANSWER_MAX_BODY_BYTES,
    );
    expect(trpcMaxBodyBytes(url('search.answer%2Csearch.digDeeper'))).toBe(
      SEARCH_ANSWER_MAX_BODY_BYTES + DIG_DEEPER_MAX_BODY_BYTES,
    );
  });

  it('never exceeds the default however many capped calls are listed', () => {
    const many = Array.from({ length: 2_000 }, () => 'search.answer').join(',');
    expect(trpcMaxBodyBytes(url(many))).toBe(WEB_TRPC_MAX_BODY_BYTES);
  });

  it('falls back to the default when any procedure is uncapped', () => {
    expect(trpcMaxBodyBytes(url('search.answer,search.hybridSearch'))).toBe(
      WEB_TRPC_MAX_BODY_BYTES,
    );
    expect(trpcMaxBodyBytes(url('dashboard.channels.bulkImport'))).toBe(
      WEB_TRPC_MAX_BODY_BYTES,
    );
    expect(trpcMaxBodyBytes('https://lets.church/trpc')).toBe(
      WEB_TRPC_MAX_BODY_BYTES,
    );
  });
});
