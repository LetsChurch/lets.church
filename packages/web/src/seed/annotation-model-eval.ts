import { createHash } from 'node:crypto';

import type {
  AnnotationMetadata,
  EvalParagraph,
  ResolvedAnnotation,
} from '@letschurch/temporal/activities/background/annotate-transcript';
import type { RunAnnotationEditsResult } from '@letschurch/temporal/activities/background/annotate-transcript-edits';

export const EVAL_STRATEGIES = ['markdown', 'span-edits'] as const;
export type EvalStrategy = (typeof EVAL_STRATEGIES)[number];

export type CorpusItem = {
  id: string;
  title: string;
  description: string | null;
  channelName: string;
  paragraphs: EvalParagraph[];
  goldCases: GoldCase[];
};

export type GoldCase = {
  paragraphId: string;
  paragraphOrder: number;
  text: string;
  ref: Record<string, unknown>;
  type: string;
  reason?: string;
};

export type CatalogModel = {
  id: string;
  canonical_slug?: string;
  name?: string;
  pricing: {
    prompt: string;
    completion: string;
    input_cache_read?: string;
    overrides?: Array<{
      min_prompt_tokens?: number;
      prompt?: string;
      completion?: string;
      input_cache_read?: string;
    }>;
  };
  [key: string]: unknown;
};

export type SampleScore = {
  total: number;
  covered: number;
  byType: Record<string, { total: number; covered: number }>;
  details: Array<{
    type: string;
    paragraphOrder: number;
    text: string;
    expected: Record<string, unknown>;
    covered: boolean;
  }>;
};

export type EvalRun = {
  model: string;
  modelName: string;
  canonicalSlug: string;
  strategy: EvalStrategy;
  repeat: number;
  id: string;
  title: string;
  activity: string;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  valid: boolean;
  error: string | null;
  annotations: ResolvedAnnotation[];
  stats: {
    paragraphs: number;
    outline: number;
    bible: number;
    keyword: number;
    skipped: number;
    durationMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    costUsd: number | null;
  } | null;
  editDiagnostics: RunAnnotationEditsResult['editDiagnostics'] | null;
  responseText: string | null;
  pricing: {
    publishedInputPerMTokens: number;
    publishedOutputPerMTokens: number;
    publishedCachedInputPerMTokens: number | null;
    estimatedListCostUsd: number | null;
  };
  sample: SampleScore;
};

export type EvalAggregate = {
  model: string;
  modelName: string;
  canonicalSlug: string;
  strategy: EvalStrategy;
  runs: number;
  successfulRuns: number;
  validRuns: number;
  repairAttempts: number;
  promptTokens: number;
  completionTokens: number;
  meanDurationMs: number | null;
  sampledCovered: number;
  sampledTotal: number;
  sampledCoverage: number | null;
  totalEstimatedListCostUsd: number;
  meanEstimatedListCostUsd: number | null;
};

export function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeWord(value: string): string {
  return value.toLocaleLowerCase().replace(/[\p{P}\p{S}]/gu, '');
}

function goldWordRanges(
  paragraph: EvalParagraph,
  text: string,
): Array<{ start: number; end: number }> {
  const needle = text
    .split(/\s+/u)
    .map(normalizeWord)
    .filter(Boolean);
  if (needle.length === 0) return [];

  const source = paragraph.words.map(({ word }) => normalizeWord(word));
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 0; start + needle.length <= source.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (source[start + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) ranges.push({ start, end: start + needle.length });
  }
  return ranges;
}

const REFERENCE_FIELDS = [
  'book',
  'chapter',
  'verse',
  'endChapter',
  'endVerse',
] as const;

function hasExactReference(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  return REFERENCE_FIELDS.every((field) => actual[field] === expected[field]);
}

export function scoreAnnotations(
  item: CorpusItem,
  annotations: ResolvedAnnotation[],
  overlapThreshold: number,
): SampleScore {
  const paragraphs = new Map(
    item.paragraphs.map((paragraph) => [paragraph.id, paragraph]),
  );
  const bible = annotations.filter(
    (annotation) => annotation.kind === 'BIBLE',
  );
  const byType: SampleScore['byType'] = {};
  const details: SampleScore['details'] = [];
  let covered = 0;

  for (const gold of item.goldCases) {
    const type = (byType[gold.type] ??= { total: 0, covered: 0 });
    type.total += 1;
    const paragraph = paragraphs.get(gold.paragraphId);
    const ranges = paragraph ? goldWordRanges(paragraph, gold.text) : [];
    const isCovered = ranges.some((range) => {
      const goldLength = range.end - range.start;
      return bible.some((annotation) => {
        if (
          annotation.paragraphId !== gold.paragraphId ||
          annotation.startWord === null ||
          annotation.endWord === null ||
          !hasExactReference(annotation.metadata, gold.ref)
        ) {
          return false;
        }
        const overlap =
          Math.min(range.end, annotation.endWord) -
          Math.max(range.start, annotation.startWord);
        return overlap > 0 && overlap / goldLength >= overlapThreshold;
      });
    });
    if (isCovered) {
      covered += 1;
      type.covered += 1;
    }
    details.push({
      type: gold.type,
      paragraphOrder: gold.paragraphOrder,
      text: gold.text,
      expected: gold.ref,
      covered: isCovered,
    });
  }

  return { total: item.goldCases.length, covered, byType, details };
}

function numberPrice(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getPublishedPrices(
  model: CatalogModel,
  promptTokens = 0,
): { input: number; output: number; cachedInput: number | null } {
  let input = numberPrice(model.pricing.prompt);
  let output = numberPrice(model.pricing.completion);
  let cachedInput = numberPrice(model.pricing.input_cache_read);
  const overrides = [...(model.pricing.overrides ?? [])]
    .filter(
      (override) =>
        typeof override.min_prompt_tokens === 'number' &&
        override.min_prompt_tokens <= promptTokens,
    )
    .sort(
      (left, right) =>
        (left.min_prompt_tokens ?? 0) - (right.min_prompt_tokens ?? 0),
    );
  const override = overrides.at(-1);
  if (override) {
    input = numberPrice(override.prompt) ?? input;
    output = numberPrice(override.completion) ?? output;
    cachedInput = numberPrice(override.input_cache_read) ?? cachedInput;
  }
  if (input === null || output === null) {
    throw new Error(`Catalog pricing is incomplete for ${model.id}`);
  }
  return { input, output, cachedInput };
}

export function estimateListCost(
  model: CatalogModel,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  if (promptTokens === null || completionTokens === null) return null;
  const pricing = getPublishedPrices(model, promptTokens);
  return promptTokens * pricing.input + completionTokens * pricing.output;
}

export function makePricing(
  model: CatalogModel,
  promptTokens: number | null,
  completionTokens: number | null,
): EvalRun['pricing'] {
  const pricing = getPublishedPrices(model, promptTokens ?? 0);
  return {
    publishedInputPerMTokens: pricing.input * 1_000_000,
    publishedOutputPerMTokens: pricing.output * 1_000_000,
    publishedCachedInputPerMTokens:
      pricing.cachedInput === null ? null : pricing.cachedInput * 1_000_000,
    estimatedListCostUsd: estimateListCost(
      model,
      promptTokens,
      completionTokens,
    ),
  };
}

export function aggregateRuns(runs: EvalRun[]): EvalAggregate[] {
  const grouped = new Map<string, EvalRun[]>();
  for (const run of runs) {
    const key = `${run.model}\u0000${run.strategy}`;
    const group = grouped.get(key);
    if (group) group.push(run);
    else grouped.set(key, [run]);
  }

  return [...grouped.values()].map((group) => {
    const first = group[0];
    const successful = group.filter((run) => run.success);
    const durations = successful.flatMap((run) =>
      run.stats ? [run.stats.durationMs] : [],
    );
    const totalEstimatedListCostUsd = group.reduce(
      (total, run) => total + (run.pricing.estimatedListCostUsd ?? 0),
      0,
    );
    return {
      model: first.model,
      modelName: first.modelName,
      canonicalSlug: first.canonicalSlug,
      strategy: first.strategy,
      runs: group.length,
      successfulRuns: successful.length,
      validRuns: group.filter((run) => run.valid).length,
      repairAttempts: group.filter(
        (run) => run.editDiagnostics?.repairAttempted,
      ).length,
      promptTokens: group.reduce(
        (total, run) => total + (run.stats?.promptTokens ?? 0),
        0,
      ),
      completionTokens: group.reduce(
        (total, run) => total + (run.stats?.completionTokens ?? 0),
        0,
      ),
      meanDurationMs:
        durations.length === 0
          ? null
          : durations.reduce((total, duration) => total + duration, 0) /
            durations.length,
      sampledCovered: group.reduce(
        (total, run) => total + run.sample.covered,
        0,
      ),
      sampledTotal: group.reduce(
        (total, run) => total + run.sample.total,
        0,
      ),
      sampledCoverage:
        group.length === 0 ||
        group.every((run) => run.sample.total === 0)
          ? null
          : group.reduce((total, run) => total + run.sample.covered, 0) /
            group.reduce((total, run) => total + run.sample.total, 0),
      totalEstimatedListCostUsd,
      meanEstimatedListCostUsd:
        group.length === 0 ? null : totalEstimatedListCostUsd / group.length,
    };
  });
}

export function metadataFor(item: CorpusItem): AnnotationMetadata {
  return {
    channelName: item.channelName,
    title: item.title,
    description: item.description,
  };
}
