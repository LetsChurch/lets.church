import { describe, expect, it } from 'vitest';

import { isTooManyRequestsError } from './search-rate-limit-error';

describe('search rate-limit errors', () => {
  it('recognizes serialized tRPC rate-limit errors', () => {
    expect(
      isTooManyRequestsError({ data: { code: 'TOO_MANY_REQUESTS' } }),
    ).toBe(true);
    expect(isTooManyRequestsError({ data: { httpStatus: 429 } })).toBe(true);
    expect(isTooManyRequestsError(new Error('network error'))).toBe(false);
  });
});
