export type GuardOutcome = {
  outcome: string;
  errorMessage: string | null;
};

export type CompletionChoice = {
  finish_reason?: string | null;
  message?: {
    content?: string | null;
    tool_calls?: ReadonlyArray<unknown> | null;
  };
};

/**
 * Provider-level completion guards shared by live and Batch API responses.
 * Returning null means the response passed and activity-specific guards may run.
 */
export function getBuiltInCompletionGuard(
  choice: CompletionChoice | undefined,
): GuardOutcome | null {
  if (choice?.finish_reason === 'length') {
    return {
      outcome: 'guard_length_truncation',
      errorMessage:
        'Model output exceeded max_tokens (finish_reason=length) — try a model with a higher output cap or shrink the prompt',
    };
  }
  if (choice?.finish_reason === 'content_filter') {
    return {
      outcome: 'guard_content_filter',
      errorMessage:
        'Model response was blocked by the provider content filter (finish_reason=content_filter)',
    };
  }
  if (
    !choice?.message?.content &&
    !(choice?.message?.tool_calls && choice.message.tool_calls.length > 0)
  ) {
    return {
      outcome: 'guard_empty_content',
      errorMessage:
        'Model returned no content (empty `choices[0].message.content` and no tool_calls)',
    };
  }
  return null;
}

// English-prose average. This slightly overestimates token counts for the
// scripture-reference-heavy transcripts in this corpus, which is conservative
// for detecting responses that silently summarize instead of echoing the input.
export const ANNOTATION_CHARS_PER_TOKEN = 4;

// Healthy annotation completions echo the transcript and land near 1.0. The
// known silent-summarization failure mode lands around 0.2-0.3.
export const ANNOTATION_COMPLETION_FLOOR = 0.75;

export function getAnnotationCompletenessGuard(
  paragraphTexts: ReadonlyArray<string>,
  completionTokens: number | null | undefined,
): GuardOutcome {
  const estimatedTranscriptTokens = Math.ceil(
    paragraphTexts.join('\n\n').length / ANNOTATION_CHARS_PER_TOKEN,
  );
  const actualCompletionTokens = completionTokens ?? 0;

  if (
    actualCompletionTokens > 0 &&
    estimatedTranscriptTokens > 0 &&
    actualCompletionTokens <
      estimatedTranscriptTokens * ANNOTATION_COMPLETION_FLOOR
  ) {
    return {
      outcome: 'guard_silent_summarization',
      errorMessage: `Model output too short (${actualCompletionTokens} completion tokens vs ~${estimatedTranscriptTokens} estimated transcript tokens, ${Math.round(
        (actualCompletionTokens / estimatedTranscriptTokens) * 100,
      )}%, floor ${Math.round(ANNOTATION_COMPLETION_FLOOR * 100)}%). Likely silent summarization or truncation — the model did not echo every paragraph verbatim.`,
    };
  }

  return { outcome: 'success', errorMessage: null };
}
