import { describe, expect, it } from 'vitest';

import {
  getAnnotationCompletenessGuard,
  getBuiltInCompletionGuard,
} from './llm-completion-guards';

describe('getBuiltInCompletionGuard', () => {
  it('rejects length, content-filter, and empty responses', () => {
    expect(
      getBuiltInCompletionGuard({
        finish_reason: 'length',
        message: { content: 'partial' },
      })?.outcome,
    ).toBe('guard_length_truncation');
    expect(
      getBuiltInCompletionGuard({
        finish_reason: 'content_filter',
        message: { content: null },
      })?.outcome,
    ).toBe('guard_content_filter');
    expect(
      getBuiltInCompletionGuard({
        finish_reason: 'stop',
        message: { content: '' },
      })?.outcome,
    ).toBe('guard_empty_content');
  });

  it('allows text and tool-call responses', () => {
    expect(
      getBuiltInCompletionGuard({
        finish_reason: 'stop',
        message: { content: 'complete' },
      }),
    ).toBeNull();
    expect(
      getBuiltInCompletionGuard({
        finish_reason: 'tool_calls',
        message: { content: null, tool_calls: [{}] },
      }),
    ).toBeNull();
  });
});

describe('getAnnotationCompletenessGuard', () => {
  const paragraphTexts = ['a'.repeat(200), 'b'.repeat(200)];

  it('rejects a parseable response below the transcript echo floor', () => {
    const result = getAnnotationCompletenessGuard(paragraphTexts, 50);
    expect(result.outcome).toBe('guard_silent_summarization');
    expect(result.errorMessage).toContain('Model output too short');
  });

  it('accepts a response at the transcript echo floor', () => {
    // 402 chars including the paragraph separator => 101 estimated tokens;
    // ceil(101 * 0.75) is the first safe integral completion-token count.
    expect(getAnnotationCompletenessGuard(paragraphTexts, 76)).toEqual({
      outcome: 'success',
      errorMessage: null,
    });
  });
});
