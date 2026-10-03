import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  runAnnotationEdits,
  type RunAnnotationEditsResult,
} from '@letschurch/temporal/activities/background/annotate-transcript-edits';
import { runAnnotation } from '@letschurch/temporal/activities/background/annotate-transcript';

import {
  aggregateRuns,
  EVAL_STRATEGIES,
  getPublishedPrices,
  hashJson,
  makePricing,
  metadataFor,
  scoreAnnotations,
  type CatalogModel,
  type CorpusItem,
  type EvalRun,
  type EvalStrategy,
  type GoldCase,
} from './annotation-model-eval';

const DEFAULT_CORPUS = '/seed-data/eval/annotation-edits-20260930';
const DEFAULT_REPEATS = 2;
const DEFAULT_MAX_TOKENS = 32_768;
const DEFAULT_OVERLAP = 0.8;

type CliOptions = {
  models: string[];
  corpusDir: string;
  outputDir: string;
  strategies: EvalStrategy[];
  repeats: number;
  maxTokens: number;
  overlap: number;
  itemIds: string[];
  limit: number | null;
  resume: boolean;
  dryRun: boolean;
};

type SourceCorpusItem = {
  id: string;
  title: string;
  description?: string | null;
  channel_name?: string;
  paragraphs: Array<{
    id: string;
    order: number;
    text: string;
    words: Array<{ word: string; start: number; end: number }>;
  }>;
};

type Plan = {
  version: 1;
  createdAt: string;
  corpusDir: string;
  corpusHash: string;
  models: string[];
  strategies: EvalStrategy[];
  repeats: number;
  maxTokens: number;
  overlap: number;
  items: Array<{
    id: string;
    title: string;
    paragraphs: number;
    words: number;
    goldCases: number;
  }>;
  plannedRuns: number;
  resume: boolean;
};

function usage(): never {
  console.error(`Usage:
  pnpm --filter @letschurch/web run eval:annotation-models -- \\
    --models openai/gpt-6-luna,openai/gpt-6.1-sol [options]

Options:
  --model ID               Add one model; repeat as needed
  --models ID,ID           Add comma-separated models
  --corpus DIR             Corpus directory (default: ${DEFAULT_CORPUS})
  --output DIR             Output directory (default: timestamped under /seed-data/eval)
  --strategies LIST        markdown,span-edits (default: both)
  --repeats N              Runs per item/model/strategy (default: ${DEFAULT_REPEATS})
  --max-tokens N           Completion limit (default: ${DEFAULT_MAX_TOKENS})
  --overlap NUMBER         Gold selected-word overlap threshold (default: ${DEFAULT_OVERLAP})
  --item ID                Include one corpus item; repeat as needed
  --limit N                Include the first N selected corpus items
  --no-resume              Re-run and overwrite successful result files
  --dry-run                Validate corpus/models and write plan without LLM calls
  --help                    Show this help`);
  process.exit(2);
}

function valueAfter(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer`);
  }
  return parsed;
}

function defaultOutputDir(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
  return `/seed-data/eval/annotation-models-${timestamp}`;
}

function parseCli(args: string[]): CliOptions {
  const models: string[] = [];
  const itemIds: string[] = [];
  let corpusDir = DEFAULT_CORPUS;
  let outputDir = defaultOutputDir();
  let strategies: EvalStrategy[] = [...EVAL_STRATEGIES];
  let repeats = DEFAULT_REPEATS;
  let maxTokens = DEFAULT_MAX_TOKENS;
  let overlap = DEFAULT_OVERLAP;
  let limit: number | null = null;
  let resume = true;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg === '--help') usage();
    if (arg === '--model') {
      models.push(valueAfter(args, index, arg));
      index += 1;
    } else if (arg === '--models') {
      models.push(
        ...valueAfter(args, index, arg)
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
      index += 1;
    } else if (arg === '--corpus') {
      corpusDir = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === '--output') {
      outputDir = valueAfter(args, index, arg);
      index += 1;
    } else if (arg === '--strategies') {
      const requested = valueAfter(args, index, arg).split(',');
      if (
        requested.length === 0 ||
        requested.some(
          (strategy) =>
            !EVAL_STRATEGIES.includes(strategy as EvalStrategy),
        )
      ) {
        throw new Error(
          `--strategies must contain only ${EVAL_STRATEGIES.join(',')}`,
        );
      }
      strategies = [...new Set(requested)] as EvalStrategy[];
      index += 1;
    } else if (arg === '--repeats') {
      repeats = positiveInteger(valueAfter(args, index, arg), arg);
      index += 1;
    } else if (arg === '--max-tokens') {
      maxTokens = positiveInteger(valueAfter(args, index, arg), arg);
      index += 1;
    } else if (arg === '--overlap') {
      overlap = Number(valueAfter(args, index, arg));
      if (!Number.isFinite(overlap) || overlap <= 0 || overlap > 1) {
        throw new Error('--overlap must be greater than 0 and at most 1');
      }
      index += 1;
    } else if (arg === '--item') {
      itemIds.push(valueAfter(args, index, arg));
      index += 1;
    } else if (arg === '--limit') {
      limit = positiveInteger(valueAfter(args, index, arg), arg);
      index += 1;
    } else if (arg === '--no-resume') {
      resume = false;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const uniqueModels = [...new Set(models)];
  if (uniqueModels.length === 0) throw new Error('At least one model is required');
  return {
    models: uniqueModels,
    corpusDir: path.resolve(corpusDir),
    outputDir: path.resolve(outputDir),
    strategies,
    repeats,
    maxTokens,
    overlap,
    itemIds: [...new Set(itemIds)],
    limit,
    resume,
    dryRun,
  };
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

function assertCorpusItem(value: SourceCorpusItem): void {
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    !Array.isArray(value.paragraphs) ||
    value.paragraphs.length === 0
  ) {
    throw new Error('corpus.json contains an invalid item');
  }
  for (const paragraph of value.paragraphs) {
    if (
      typeof paragraph.id !== 'string' ||
      typeof paragraph.order !== 'number' ||
      typeof paragraph.text !== 'string' ||
      !Array.isArray(paragraph.words)
    ) {
      throw new Error(`Corpus item ${value.id} has an invalid paragraph`);
    }
  }
}

async function loadCorpus(options: CliOptions): Promise<CorpusItem[]> {
  const source = await readJson<SourceCorpusItem[]>(
    path.join(options.corpusDir, 'corpus.json'),
  );
  if (!Array.isArray(source) || source.length === 0) {
    throw new Error('corpus.json must be a non-empty array');
  }

  let selected = source;
  if (options.itemIds.length > 0) {
    const requested = new Set(options.itemIds);
    selected = source.filter((item) => requested.has(item.id));
    const found = new Set(selected.map((item) => item.id));
    const missing = options.itemIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new Error(`Unknown corpus item(s): ${missing.join(', ')}`);
    }
  }
  if (options.limit !== null) selected = selected.slice(0, options.limit);
  if (selected.length === 0) throw new Error('No corpus items selected');

  return Promise.all(
    selected.map(async (item) => {
      assertCorpusItem(item);
      const gold = await readJson<{ id: string; cases: GoldCase[] }>(
        path.join(options.corpusDir, `gold-${item.id}.json`),
      );
      if (gold.id !== item.id || !Array.isArray(gold.cases)) {
        throw new Error(`Invalid gold file for ${item.id}`);
      }
      return {
        id: item.id,
        title: item.title,
        description: item.description ?? null,
        channelName: item.channel_name ?? 'Evaluation',
        paragraphs: item.paragraphs,
        goldCases: gold.cases,
      };
    }),
  );
}

async function loadCatalog(
  requested: string[],
): Promise<Array<{ requested: string; catalog: CatalogModel }>> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: process.env.OPENROUTER_API_KEY
      ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
      : undefined,
  });
  if (!response.ok) {
    throw new Error(`OpenRouter catalog request failed: ${response.status}`);
  }
  const body = (await response.json()) as { data?: CatalogModel[] };
  if (!Array.isArray(body.data)) {
    throw new Error('OpenRouter catalog response has no model array');
  }

  return requested.map((model) => {
    const catalog = body.data?.find(
      (candidate) =>
        candidate.id === model || candidate.canonical_slug === model,
    );
    if (!catalog) throw new Error(`Model not found in OpenRouter catalog: ${model}`);
    getPublishedPrices(catalog);
    return { requested: model, catalog };
  });
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

function resultFile(
  outputDir: string,
  model: string,
  strategy: EvalStrategy,
  itemId: string,
  repeat: number,
): string {
  const safeModel = model.replaceAll('/', '__').replace(/[^a-zA-Z0-9_.-]/gu, '_');
  return path.join(
    outputDir,
    'results',
    `${safeModel}.${strategy}.${itemId}.${repeat}.json`,
  );
}

function activityName(
  outputDir: string,
  model: string,
  strategy: EvalStrategy,
  itemId: string,
  repeat: number,
): string {
  const run = path.basename(outputDir).replace(/[^a-zA-Z0-9_-]/gu, '_');
  const safeModel = model.replace(/[^a-zA-Z0-9_-]/gu, '_');
  return `evalAnnotationMatrix:${run}:${strategy}:${safeModel}:${itemId.slice(0, 8)}:${repeat}`;
}

function planFor(options: CliOptions, corpus: CorpusItem[]): Plan {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    corpusDir: options.corpusDir,
    corpusHash: hashJson(
      corpus.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        channelName: item.channelName,
        paragraphs: item.paragraphs,
        goldCases: item.goldCases,
      })),
    ),
    models: options.models,
    strategies: options.strategies,
    repeats: options.repeats,
    maxTokens: options.maxTokens,
    overlap: options.overlap,
    items: corpus.map((item) => ({
      id: item.id,
      title: item.title,
      paragraphs: item.paragraphs.length,
      words: item.paragraphs.reduce(
        (total, paragraph) => total + paragraph.words.length,
        0,
      ),
      goldCases: item.goldCases.length,
    })),
    plannedRuns:
      options.models.length *
      options.strategies.length *
      options.repeats *
      corpus.length,
    resume: options.resume,
  };
}

function comparablePlan(plan: Plan): Omit<Plan, 'createdAt' | 'resume'> {
  const { createdAt: _createdAt, resume: _resume, ...comparable } = plan;
  return comparable;
}

async function writeOrCheckPlan(
  outputDir: string,
  plan: Plan,
): Promise<Plan> {
  const file = path.join(outputDir, 'plan.json');
  if (await exists(file)) {
    const existing = await readJson<Plan>(file);
    if (
      JSON.stringify(comparablePlan(existing)) !==
      JSON.stringify(comparablePlan(plan))
    ) {
      throw new Error(
        `Output directory has a different plan: ${file}. Choose another --output directory.`,
      );
    }
    return existing;
  }
  await writeJsonAtomic(file, plan);
  return plan;
}

function makeFailedRun(
  model: { requested: string; catalog: CatalogModel },
  strategy: EvalStrategy,
  repeat: number,
  item: CorpusItem,
  activity: string,
  startedAt: string,
  error: unknown,
  overlap: number,
): EvalRun {
  return {
    model: model.requested,
    modelName: model.catalog.name ?? model.requested,
    canonicalSlug: model.catalog.canonical_slug ?? model.catalog.id,
    strategy,
    repeat,
    id: item.id,
    title: item.title,
    activity,
    startedAt,
    finishedAt: new Date().toISOString(),
    success: false,
    valid: false,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    annotations: [],
    stats: null,
    editDiagnostics: null,
    responseText: null,
    pricing: makePricing(model.catalog, null, null),
    sample: scoreAnnotations(item, [], overlap),
  };
}

async function executeRun(
  model: { requested: string; catalog: CatalogModel },
  strategy: EvalStrategy,
  repeat: number,
  item: CorpusItem,
  options: CliOptions,
): Promise<EvalRun> {
  const startedAt = new Date().toISOString();
  const activity = activityName(
    options.outputDir,
    model.requested,
    strategy,
    item.id,
    repeat,
  );
  try {
    const result =
      strategy === 'markdown'
        ? await runAnnotation(
            item.paragraphs,
            metadataFor(item),
            model.requested,
            {
              via: 'openrouter',
              fallbackModel: null,
              maxTokens: options.maxTokens,
              tracking: { activity, uploadRecordId: null },
            },
          )
        : await runAnnotationEdits(
            item.paragraphs,
            metadataFor(item),
            model.requested,
            {
              via: 'openrouter',
              fallbackModel: null,
              maxTokens: options.maxTokens,
              tracking: { activity, uploadRecordId: null },
            },
          );
    const editDiagnostics =
      strategy === 'span-edits'
        ? (result as RunAnnotationEditsResult).editDiagnostics
        : null;
    return {
      model: model.requested,
      modelName: model.catalog.name ?? model.requested,
      canonicalSlug: model.catalog.canonical_slug ?? model.catalog.id,
      strategy,
      repeat,
      id: item.id,
      title: item.title,
      activity,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: true,
      valid: editDiagnostics?.valid ?? true,
      error: null,
      annotations: result.annotations,
      stats: result.stats,
      editDiagnostics,
      responseText: result.responseText,
      pricing: makePricing(
        model.catalog,
        result.stats.promptTokens,
        result.stats.completionTokens,
      ),
      sample: scoreAnnotations(
        item,
        result.annotations,
        options.overlap,
      ),
    };
  } catch (error) {
    return makeFailedRun(
      model,
      strategy,
      repeat,
      item,
      activity,
      startedAt,
      error,
      options.overlap,
    );
  }
}

function usd(value: number | null, digits = 4): string {
  return value === null ? 'n/a' : `$${value.toFixed(digits)}`;
}

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function report(
  plan: Plan,
  models: Array<{ requested: string; catalog: CatalogModel }>,
  runs: EvalRun[],
): string {
  const aggregates = aggregateRuns(runs);
  const totalCost = aggregates.reduce(
    (total, aggregate) => total + aggregate.totalEstimatedListCostUsd,
    0,
  );
  const failures = runs.filter((run) => !run.success || !run.valid);
  const lines = [
    '# Annotation model evaluation',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Corpus: ${plan.items.length} item(s), ${plan.items.reduce((total, item) => total + item.goldCases, 0)} gold cases`,
    '',
    `Protocol: ${plan.repeats} repeat(s); strategies ${plan.strategies.join(', ')}; exact reference metadata and at least ${(plan.overlap * 100).toFixed(0)}% selected-word overlap; provider defaults; ${plan.maxTokens} maximum completion tokens; no fallback.`,
    '',
    '## Published pricing',
    '',
    '| Requested model | Concrete version | Input / 1M | Cached input / 1M | Output / 1M |',
    '|---|---|---:|---:|---:|',
  ];
  for (const model of models) {
    const pricing = getPublishedPrices(model.catalog);
    lines.push(
      `| ${model.requested} | \`${model.catalog.canonical_slug ?? model.catalog.id}\` | ${usd(pricing.input * 1_000_000, 2)} | ${usd(pricing.cachedInput === null ? null : pricing.cachedInput * 1_000_000, 2)} | ${usd(pricing.output * 1_000_000, 2)} |`,
    );
  }
  lines.push(
    '',
    '## Results',
    '',
    '| Model | Strategy | Valid | Gold recall | Mean latency | Mean estimated cost | Total estimated cost |',
    '|---|---|---:|---:|---:|---:|---:|',
  );
  for (const aggregate of aggregates) {
    lines.push(
      `| ${aggregate.modelName} | ${aggregate.strategy} | ${aggregate.validRuns}/${aggregate.runs} | ${aggregate.sampledCovered}/${aggregate.sampledTotal} (${percent(aggregate.sampledCoverage)}) | ${aggregate.meanDurationMs === null ? 'n/a' : `${(aggregate.meanDurationMs / 1000).toFixed(1)}s`} | ${usd(aggregate.meanEstimatedListCostUsd)} | ${usd(aggregate.totalEstimatedListCostUsd)} |`,
    );
  }
  lines.push(
    '',
    `**Total estimated list-price spend: ${usd(totalCost)}**`,
    '',
    'Costs are reconstructed from audited prompt/completion token counts and the captured OpenRouter catalog rates. They include attempted repairs and invalid outputs, exclude unreported cache discounts, and are not invoice totals.',
  );
  if (failures.length > 0) {
    lines.push('', '## Failed or invalid runs', '');
    for (const run of failures) {
      const reasons = run.editDiagnostics?.errors.map((error) => error.reason);
      lines.push(
        `- ${run.model} / ${run.strategy} / ${run.title} / repeat ${run.repeat}: ${run.error ?? reasons?.join(', ') ?? 'invalid result'}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

async function writeSummary(
  outputDir: string,
  plan: Plan,
  models: Array<{ requested: string; catalog: CatalogModel }>,
  runs: EvalRun[],
): Promise<void> {
  const aggregates = aggregateRuns(runs);
  await writeJsonAtomic(path.join(outputDir, 'summary.json'), {
    generatedAt: new Date().toISOString(),
    plan,
    models: models.map(({ requested, catalog }) => ({
      requested,
      id: catalog.id,
      canonicalSlug: catalog.canonical_slug ?? catalog.id,
      name: catalog.name ?? requested,
      pricing: catalog.pricing,
    })),
    aggregates,
    runs: runs.map((run) => ({
      model: run.model,
      canonicalSlug: run.canonicalSlug,
      strategy: run.strategy,
      repeat: run.repeat,
      id: run.id,
      title: run.title,
      success: run.success,
      valid: run.valid,
      error: run.error,
      stats: run.stats,
      pricing: run.pricing,
      sample: run.sample,
      repairAttempted: run.editDiagnostics?.repairAttempted ?? false,
      diagnosticReasons: run.editDiagnostics?.errors.map(
        (diagnostic) => diagnostic.reason,
      ),
    })),
    totalEstimatedListCostUsd: aggregates.reduce(
      (total, aggregate) => total + aggregate.totalEstimatedListCostUsd,
      0,
    ),
  });
  await writeFile(path.join(outputDir, 'report.md'), report(plan, models, runs));
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const [corpus, models] = await Promise.all([
    loadCorpus(options),
    loadCatalog(options.models),
  ]);
  const requestedPlan = planFor(options, corpus);
  await mkdir(path.join(options.outputDir, 'results'), { recursive: true });
  const plan = await writeOrCheckPlan(options.outputDir, requestedPlan);
  await writeJsonAtomic(
    path.join(options.outputDir, 'models.json'),
    models.map(({ requested, catalog }) => ({ requested, ...catalog })),
  );

  console.log(`[eval] output: ${options.outputDir}`);
  console.log(
    `[eval] ${plan.plannedRuns} planned runs (${models.length} models × ${options.strategies.length} strategies × ${corpus.length} items × ${options.repeats} repeats)`,
  );
  for (const { requested, catalog } of models) {
    const pricing = getPublishedPrices(catalog);
    console.log(
      `[eval] ${requested} -> ${catalog.canonical_slug ?? catalog.id}: $${(pricing.input * 1_000_000).toFixed(2)}/M input, $${(pricing.output * 1_000_000).toFixed(2)}/M output`,
    );
  }
  if (options.dryRun) {
    console.log('[eval] dry run complete; no LLM calls made');
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required for paid evaluation runs');
  }

  const runs: EvalRun[] = [];
  let completed = 0;
  for (const model of models) {
    for (const strategy of options.strategies) {
      for (const item of corpus) {
        for (let repeat = 1; repeat <= options.repeats; repeat += 1) {
          const file = resultFile(
            options.outputDir,
            model.requested,
            strategy,
            item.id,
            repeat,
          );
          let run: EvalRun | null = null;
          if (options.resume && (await exists(file))) {
            const previous = await readJson<EvalRun>(file);
            if (previous.success) run = previous;
          }
          if (run) {
            console.log(`[eval] resume ${path.basename(file)}`);
          } else {
            console.log(`[eval] run ${path.basename(file)}`);
            run = await executeRun(model, strategy, repeat, item, options);
            await writeJsonAtomic(file, run);
          }
          runs.push(run);
          completed += 1;
          await writeSummary(options.outputDir, plan, models, runs);
          console.log(
            `[eval] ${completed}/${plan.plannedRuns}: valid=${run.valid} recall=${run.sample.covered}/${run.sample.total} cost=${usd(run.pricing.estimatedListCostUsd)}`,
          );
        }
      }
    }
  }
  console.log(`[eval] complete: ${path.join(options.outputDir, 'report.md')}`);
}

await main();
