import { describe, expect, it } from 'vitest';

import { getBatchAccountingErrors } from './llm-batch-accounting';
import type { BatchStatus } from './openai-batch';

function completedStatus(overrides: Partial<BatchStatus> = {}): BatchStatus {
  return {
    status: 'completed',
    outputFileId: 'output-file',
    errorFileId: null,
    requestCount: 2,
    completedCount: 2,
    failedCount: 0,
    ...overrides,
  };
}

describe('getBatchAccountingErrors', () => {
  it('accepts a fully reconciled completed shard', () => {
    expect(
      getBatchAccountingErrors(2, completedStatus(), {
        succeeded: 2,
        failed: 0,
      }),
    ).toEqual([]);
  });

  it('rejects completed requests without an output file', () => {
    expect(
      getBatchAccountingErrors(2, completedStatus({ outputFileId: null }), {
        succeeded: 0,
        failed: 0,
      }),
    ).toEqual([
      'provider reported 2 completed request(s) without an output file',
      'processed lines 0 != submitted 2',
    ]);
  });

  it('rejects failed requests without an error file', () => {
    expect(
      getBatchAccountingErrors(
        2,
        completedStatus({
          completedCount: 1,
          failedCount: 1,
          errorFileId: null,
        }),
        { succeeded: 1, failed: 1 },
      ),
    ).toEqual(['provider reported 1 failed request(s) without an error file']);
  });

  it('rejects provider and processed-line count mismatches', () => {
    expect(
      getBatchAccountingErrors(
        3,
        completedStatus({
          requestCount: 2,
          completedCount: 1,
          failedCount: 0,
        }),
        { succeeded: 1, failed: 0 },
      ),
    ).toEqual([
      'provider total 2 != submitted 3',
      'provider completed+failed 1 != total 2',
      'processed lines 1 != submitted 3',
    ]);
  });
});
