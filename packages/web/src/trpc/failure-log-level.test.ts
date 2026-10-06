import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { trpcFailureLogLevel } from './failure-log-level';

describe('tRPC failure log level', () => {
  it('logs client errors as warnings', () => {
    for (const code of [
      'BAD_REQUEST',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'TOO_MANY_REQUESTS',
    ] as const) {
      expect(trpcFailureLogLevel(new TRPCError({ code }))).toBe('warn');
    }
  });

  it('logs server failures and unexpected throws as errors', () => {
    expect(
      trpcFailureLogLevel(new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })),
    ).toBe('error');
    expect(
      trpcFailureLogLevel(new TRPCError({ code: 'SERVICE_UNAVAILABLE' })),
    ).toBe('error');
    expect(trpcFailureLogLevel(new Error('boom'))).toBe('error');
  });
});
