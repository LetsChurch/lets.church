import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Container,
  Grid,
  Group,
  Loader,
  NumberInput,
  Radio,
  Select,
  Stack,
  TagsInput,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy, IconRefresh } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { z } from 'zod';
import { idTranslator } from '@/schemas/common';
import { useTRPC } from '@/trpc/react';
import { showFailure } from '../-mantine';

// URL is the source of truth — task + uploadId + a comma-separated model
// list are all queryable, so the eval state survives refresh and is
// shareable. `models` stays as the raw CSV string (no zod transform) so
// TanStack Router's typed Link/navigate accept the same shape they emit.
// We split on commas inside the component where it's used as an array.
const searchSchema = z.object({
  uploadId: z.string().optional(),
  task: z.enum(['annotate', 'summarize']).catch('annotate'),
  models: z.string().optional(),
  // Per-call override of the activity's default output cap. Use when
  // routing to providers with tighter limits (DeepSeek v3.x = 8K-16K) —
  // OpenRouter rejects requests whose `max_tokens` exceeds the model's
  // cap before they ever run.
  maxTokens: z.coerce.number().int().positive().max(131072).optional(),
});

function parseModels(csv: string | undefined): string[] {
  return (csv ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

export const Route = createFileRoute('/dashboard_/admin_/llm-eval')({
  component: LlmEvalPage,
  validateSearch: searchSchema,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );
    if (currentUser.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: () => ({
    backNavigation: { label: 'Admin', to: '/dashboard/admin' },
  }),
});

// Tasks the eval supports today. Both feed the same chosen models — admins
// pick which one they're benchmarking via the radio above the chip input.
const TASK_LABELS: Record<'annotate' | 'summarize', string> = {
  annotate: 'Annotate (outline + scripture + keyword)',
  summarize: 'Summarize (display + search summaries)',
};

type AnnotationItem = {
  paragraphId: string;
  kind: 'OUTLINE' | 'BIBLE' | 'KEYWORD';
  startWord: number | null;
  endWord: number | null;
  rawSpan: string | null;
  metadata: Record<string, unknown>;
};

type SentPrompt = { system: string; user: string };

type SkippedItem = {
  paragraphId: string;
  paragraphOrder: number;
  kind: 'BIBLE' | 'KEYWORD';
  span: string;
  metadata: Record<string, unknown>;
  reason: 'not_found' | 'invalid_metadata';
};

type AnnotateOk = {
  status: 'ok';
  task: 'annotate';
  annotations: AnnotationItem[];
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
  };
  prompt: SentPrompt;
  responseText?: string;
  skippedItems?: SkippedItem[];
};

type SummarizeOk = {
  status: 'ok';
  task: 'summarize';
  summary: string;
  searchSummary: string;
  stats: {
    durationMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    summaryLength: number;
    searchSummaryLength: number;
    costUsd: number | null;
  };
  prompt: SentPrompt;
  responseText?: string;
};

type ResultState =
  | { status: 'pending' }
  | AnnotateOk
  | SummarizeOk
  | { status: 'error'; error: string };

function LlmEvalPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const trpc = useTRPC();

  // Local mutable copy of the URL state. Writing to the URL on every
  // keystroke would re-mount the upload selector; instead we sync up the
  // URL when the user actually triggers a run.
  const [task, setTask] = useState<'annotate' | 'summarize'>(search.task);
  // Default to the production annotate model when no URL state — admins land
  // on the page already able to run a baseline comparison with one click.
  const [models, setModels] = useState<string[]>(() => {
    const fromUrl = parseModels(search.models);
    return fromUrl.length > 0 ? fromUrl : ['openai/gpt-5.4-mini'];
  });
  const [uploadId, setUploadId] = useState<string | undefined>(search.uploadId);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(
    search.maxTokens,
  );
  const [uploadSearch, setUploadSearch] = useState('');
  const [debouncedUploadSearch] = useDebounce(uploadSearch, 200);

  // Upload picker — reuse the `search.hybridSearch` (lc_media_v1) procedure the
  // main search page uses. The hits come back with base58-encoded upload ids; we
  // decode them to UUIDs before storing so the page's URL search param stays
  // UUID-shaped (the dashboard convention).
  // User-driven query: fires only when the admin types in the picker.
  // Disable automatic refresh — once results land, refocusing the
  // window or reconnecting shouldn't re-issue the same search.
  const uploadSearchQuery = useQuery({
    ...trpc.search.hybridSearch.queryOptions({
      q: debouncedUploadSearch,
      limit: 20,
    }),
    enabled: debouncedUploadSearch.length >= 2,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  // Pre-populate the upload picker label when a uploadId is supplied
  // in the URL (the search procedure is keyword-only, so it can't
  // resolve an id directly). Also feeds the result cards their
  // paragraph source-of-record. User-driven (upload selection) — no
  // auto-refresh.
  const uploadQuery = useQuery({
    ...trpc.dashboard.admin.getUploadForEval.queryOptions({
      uploadRecordId: uploadId ?? '',
    }),
    enabled: !!uploadId,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const uploadOptions = useMemo(() => {
    const items = (uploadSearchQuery.data?.items ?? []) as Array<{
      id: string;
      title?: string | null;
      channel?: { name?: string | null } | null;
    }>;
    const fromSearch = items.map((u) => ({
      // search.hybridSearch ids are base58-encoded; decode so the
      // Select's value (and the URL search param it backs) is UUID.
      value: idTranslator.validate(u.id) ? idTranslator.toUUID(u.id) : u.id,
      label: u.title
        ? `${u.title}${u.channel?.name ? ` — ${u.channel.name}` : ''}`
        : `Untitled${u.channel?.name ? ` — ${u.channel.name}` : ''}`,
    }));
    // Make sure the currently-selected upload always has a label,
    // even when it's outside the current search results.
    if (uploadId && uploadQuery.data) {
      const already = fromSearch.find((o) => o.value === uploadId);
      if (!already) {
        fromSearch.unshift({
          value: uploadId,
          label: `${uploadQuery.data.title ?? 'Untitled'} — ${uploadQuery.data.channelName}`,
        });
      }
    }
    return fromSearch;
  }, [uploadSearchQuery.data, uploadQuery.data, uploadId]);

  // Per-model state map. Each model has its own pending/ok/error entry
  // so fast models render as soon as they resolve; slow models keep
  // their card in the loading state without blocking the rest.
  const [resultsByModel, setResultsByModel] = useState<
    Map<string, ResultState>
  >(new Map());

  const evaluateMutation = useMutation(
    trpc.dashboard.admin.evaluateLlmModel.mutationOptions({
      // No on{Success,Error} here — we drive per-model state updates
      // from the per-call mutateAsync return / throw below so each
      // card flips at its own resolution time.
    }),
  );

  const isAnyPending = useMemo(
    () =>
      Array.from(resultsByModel.values()).some((r) => r.status === 'pending'),
    [resultsByModel],
  );

  const canRun =
    !!uploadId && models.length > 0 && !isAnyPending && !!uploadQuery.data;

  // Run a single model: flip its card to pending, fire the mutation,
  // settle the card on completion. Extracted so per-card retry buttons
  // can re-trigger one model independently of the rest.
  const runOne = useCallback(
    async (model: string) => {
      if (!uploadId) return;
      setResultsByModel((prev) => {
        const next = new Map(prev);
        next.set(model, { status: 'pending' });
        return next;
      });
      try {
        const res = await evaluateMutation.mutateAsync({
          uploadRecordId: uploadId,
          task,
          model,
          maxTokens,
        });
        setResultsByModel((prev) => {
          const next = new Map(prev);
          next.set(model, { status: 'ok', ...res });
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setResultsByModel((prev) => {
          const next = new Map(prev);
          next.set(model, { status: 'error', error: message });
          return next;
        });
        showFailure({ message: `${model}: ${message}` });
      }
    },
    [uploadId, task, maxTokens, evaluateMutation],
  );

  async function run() {
    if (!uploadId || models.length === 0) return;
    // Sync URL so the eval is shareable / refresh-safe.
    navigate({
      to: '.',
      search: { uploadId, task, models: models.join(','), maxTokens },
      replace: true,
    });
    // Seed pending state for every selected model so each card renders
    // immediately with a loader, then fires its own async fetch.
    const initial = new Map<string, ResultState>();
    for (const m of models) initial.set(m, { status: 'pending' });
    setResultsByModel(initial);
    await Promise.all(models.map((model) => runOne(model)));
  }

  const paragraphs = uploadQuery.data?.paragraphs ?? [];
  const paragraphsById = useMemo(() => {
    const map = new Map<string, { id: string; order: number; text: string }>();
    for (const p of paragraphs) map.set(p.id, p);
    return map;
  }, [paragraphs]);

  // Stable ordering for the result grid — follow the models list the
  // admin typed, so reruns with the same models don't reshuffle cards.
  const orderedResults = useMemo(
    () =>
      Array.from(resultsByModel.entries()).sort(([a], [b]) => {
        const ai = models.indexOf(a);
        const bi = models.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }),
    [resultsByModel, models],
  );

  // Every model in a run gets the same system + user content (task
  // scoped, not model scoped), so use the first successful result's
  // prompt for the global Copy button.
  const sharedPrompt = useMemo<SentPrompt | null>(() => {
    for (const [, state] of orderedResults) {
      if (state.status === 'ok') return state.prompt;
    }
    return null;
  }, [orderedResults]);

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={1}>LLM model evaluation</Title>
          <Text c="dimmed" size="sm">
            Runs the production <Code>annotate</Code> / <Code>summarize</Code>{' '}
            pipelines against the chosen upload and models in parallel and shows
            the parsed outputs side by side. Read-only — does not persist
            results to the upload's stored summary / annotations.
          </Text>
        </Stack>

        <Card withBorder padding="md">
          <Stack gap="md">
            <Select
              label="Upload"
              placeholder="Search by title (min 2 chars)…"
              data={uploadOptions}
              value={uploadId ?? null}
              onChange={(v) => setUploadId(v ?? undefined)}
              searchable
              clearable
              searchValue={uploadSearch}
              onSearchChange={setUploadSearch}
              nothingFoundMessage={
                debouncedUploadSearch.length < 2
                  ? 'Type at least 2 characters…'
                  : uploadSearchQuery.isFetching
                    ? 'Searching…'
                    : 'No uploads matched'
              }
            />

            <Radio.Group
              label="Task"
              value={task}
              onChange={(v) =>
                setTask((v as 'annotate' | 'summarize') ?? 'annotate')
              }
            >
              <Stack gap="xs" mt="xs">
                <Radio value="annotate" label={TASK_LABELS.annotate} />
                <Radio value="summarize" label={TASK_LABELS.summarize} />
              </Stack>
            </Radio.Group>

            <TagsInput
              label="OpenRouter models"
              description="Free-form OpenRouter model ids. Defaults to openai/gpt-5.4-mini (our production annotate model). Add others like openai/gpt-5.4, google/gemini-2.5-pro, etc. to A/B-compare. Press Enter to add."
              placeholder="Type a model id and press Enter…"
              value={models}
              onChange={setModels}
              clearable
              maxTags={8}
            />

            <NumberInput
              label="Max output tokens"
              description="Override the per-call output cap. Leave blank to use the activity default (annotate: 32768, summarize: 4096). Lower for providers with tighter caps — DeepSeek v3.x rejects calls asking for more than 8K-16K output."
              placeholder="Default"
              value={maxTokens ?? ''}
              onChange={(v) =>
                setMaxTokens(typeof v === 'number' ? v : undefined)
              }
              min={1}
              max={131072}
              step={1024}
              thousandSeparator=","
              allowDecimal={false}
              allowNegative={false}
              clampBehavior="strict"
            />

            <Group justify="flex-end">
              <Button onClick={run} disabled={!canRun} loading={isAnyPending}>
                Run evaluation
              </Button>
            </Group>
          </Stack>
        </Card>

        {orderedResults.length > 0 ? (
          <Stack gap="md">
            <Group gap="xs" align="center" wrap="wrap">
              <Title order={3}>Results</Title>
              {uploadQuery.data ? (
                <Text c="dimmed" size="sm">
                  {uploadQuery.data.title ?? '(no title)'} —{' '}
                  {uploadQuery.data.channelName}
                </Text>
              ) : null}
              {sharedPrompt ? <CopyPromptButton prompt={sharedPrompt} /> : null}
            </Group>
            <Grid gutter="md">
              {orderedResults.map(([model, state]) => (
                <Grid.Col
                  key={model}
                  span={{
                    base: 12,
                    md: orderedResults.length === 1 ? 12 : 6,
                    lg: orderedResults.length >= 3 ? 4 : 6,
                  }}
                >
                  <ResultCard
                    model={model}
                    state={state}
                    paragraphs={paragraphs}
                    paragraphsById={paragraphsById}
                    onRetry={() => void runOne(model)}
                  />
                </Grid.Col>
              ))}
            </Grid>
          </Stack>
        ) : null}
      </Stack>
    </Container>
  );
}

function ResultCard({
  model,
  state,
  paragraphs,
  paragraphsById,
  onRetry,
}: {
  model: string;
  state: ResultState;
  paragraphs: Array<{ id: string; order: number; text: string }>;
  paragraphsById: Map<string, { id: string; order: number; text: string }>;
  onRetry: () => void;
}) {
  return (
    <Card withBorder padding="md" style={{ height: '100%' }}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Code>{model}</Code>
            {state.status === 'ok' ? (
              <Group gap="xs" mt="xs">
                <Badge variant="light">
                  {Math.round(state.stats.durationMs / 100) / 10}s
                </Badge>
                {state.stats.promptTokens != null ? (
                  <Tooltip label="Prompt tokens">
                    <Badge variant="light" color="gray">
                      in {state.stats.promptTokens.toLocaleString()}
                    </Badge>
                  </Tooltip>
                ) : null}
                {state.stats.completionTokens != null ? (
                  <Tooltip label="Completion tokens">
                    <Badge variant="light" color="gray">
                      out {state.stats.completionTokens.toLocaleString()}
                    </Badge>
                  </Tooltip>
                ) : null}
                {state.stats.costUsd != null ? (
                  <Tooltip label="OpenRouter-reported USD cost for this call">
                    <Badge variant="light" color="green">
                      {formatUsd(state.stats.costUsd)}
                    </Badge>
                  </Tooltip>
                ) : null}
              </Group>
            ) : state.status === 'error' ? (
              <Badge variant="light" color="red" mt="xs">
                Failed
              </Badge>
            ) : (
              <Badge variant="light" color="blue" mt="xs">
                Running…
              </Badge>
            )}
          </Stack>
          <Group gap={6} wrap="nowrap">
            {state.status === 'ok' && state.responseText ? (
              <CopyOutputButton responseText={state.responseText} />
            ) : null}
            <Tooltip label="Re-run this model">
              <ActionIcon
                variant={state.status === 'error' ? 'filled' : 'subtle'}
                color={state.status === 'error' ? 'red' : 'gray'}
                onClick={onRetry}
                disabled={state.status === 'pending'}
                aria-label="Retry"
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {state.status === 'pending' ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : state.status === 'error' ? (
          <Alert color="red" variant="light">
            <Code style={{ whiteSpace: 'pre-wrap' }}>{state.error}</Code>
          </Alert>
        ) : state.task === 'summarize' ? (
          <Stack gap="sm">
            <SectionLabel label="Summary" />
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {state.summary}
            </Text>
            <SectionLabel label="Search summary" muted />
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
              {state.searchSummary}
            </Text>
          </Stack>
        ) : (
          <Stack gap="sm">
            <Group gap="xs">
              <Badge variant="light">{state.stats.outline} outline</Badge>
              <Badge variant="light" color="indigo">
                {state.stats.bible} bible
              </Badge>
              <Badge variant="light" color="teal">
                {state.stats.keyword} keyword
              </Badge>
              {state.stats.skipped > 0 ? (
                <Tooltip label="Spans the LLM wrapped that we couldn't locate verbatim in the paragraph's word array">
                  <Badge variant="light" color="orange">
                    {state.stats.skipped} skipped
                  </Badge>
                </Tooltip>
              ) : null}
            </Group>
            <AnnotationsList
              annotations={state.annotations}
              paragraphs={paragraphs}
              paragraphsById={paragraphsById}
              skippedItems={state.skippedItems ?? []}
            />
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

// Format OpenRouter-reported call cost. Single-call spend is typically
// fractions of a cent, so dollar-level precision (`$0.01`) would render
// every cell as `$0.00`. Use four decimals once we're below a cent,
// two decimals otherwise.
function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

// Copy the exact system+user messages sent to the model to the clipboard.
// Format mirrors the chat-completions message list so the result can be
// pasted into an OpenAI / OpenRouter playground or another debugging
// tool. The 2-second "copied" feedback uses an icon swap, not a toast,
// since multiple cards' buttons can be clicked in close succession.
function CopyPromptButton({ prompt }: { prompt: SentPrompt }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip label={copied ? 'Copied!' : 'Copy prompt (system + user)'}>
      <Button
        size="compact-xs"
        variant="light"
        color={copied ? 'green' : 'gray'}
        leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        onClick={() => {
          const text = `[system]\n${prompt.system}\n\n[user]\n${prompt.user}\n`;
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        Prompt
      </Button>
    </Tooltip>
  );
}

// Copy the raw model response (the structured JSON it produced) to the
// clipboard. Pretty-printed when parseable so the JSON is readable;
// otherwise the raw text. Per-card because each model's output is
// distinct (the whole point of comparing models is to see their
// outputs side by side).
function CopyOutputButton({ responseText }: { responseText: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip label={copied ? 'Copied!' : 'Copy raw model output'}>
      <ActionIcon
        variant="subtle"
        color={copied ? 'green' : 'gray'}
        onClick={() => {
          // Annotate output is markdown — copy verbatim. Summary output
          // is json_object; try a pretty-print pass and fall back to
          // raw text if the parse fails.
          let text = responseText;
          try {
            text = JSON.stringify(JSON.parse(responseText), null, 2);
          } catch {
            // Keep raw text — markdown / other non-JSON shape.
          }
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
        aria-label="Copy output"
      >
        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
      </ActionIcon>
    </Tooltip>
  );
}

function SectionLabel({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <Text size="xs" fw={600} c={muted ? 'dimmed' : undefined} tt="uppercase">
      {label}
    </Text>
  );
}

function AnnotationsList({
  annotations,
  paragraphs,
  paragraphsById,
  skippedItems,
}: {
  annotations: AnnotationItem[];
  paragraphs: Array<{ id: string; order: number; text: string }>;
  paragraphsById: Map<string, { id: string; order: number; text: string }>;
  skippedItems: SkippedItem[];
}) {
  // Group annotations by paragraph for in-context display.
  const byParagraph = useMemo(() => {
    const map = new Map<string, typeof annotations>();
    for (const a of annotations) {
      const list = map.get(a.paragraphId) ?? [];
      list.push(a);
      map.set(a.paragraphId, list);
    }
    return map;
  }, [annotations]);

  // Render only paragraphs that have at least one annotation — that's the
  // signal-to-noise ratio admins care about during eval. Keeps the card
  // scrollable instead of dumping the full transcript per model column.
  const annotated = paragraphs.filter((p) => byParagraph.has(p.id));

  if (annotated.length === 0 && skippedItems.length === 0) {
    return (
      <Text size="sm" c="dimmed" fs="italic">
        Model returned no annotations.
      </Text>
    );
  }

  return (
    <Stack gap="md" mah={500} style={{ overflowY: 'auto' }}>
      {annotated.map((p) => {
        const items = byParagraph.get(p.id) ?? [];
        const outlines = items.filter((a) => a.kind === 'OUTLINE');
        const inlines = items.filter(
          (a) => a.kind === 'BIBLE' || a.kind === 'KEYWORD',
        );
        const paragraph = paragraphsById.get(p.id);
        const preview = paragraph
          ? paragraph.text.slice(0, 140) +
            (paragraph.text.length > 140 ? '…' : '')
          : `[paragraph ${p.order}]`;
        return (
          <Stack key={p.id} gap={4}>
            {outlines.map((o) => {
              const meta = o.metadata as { level?: number; title?: string };
              // Stable key from the heading's content + level. Same paragraph
              // can in principle have multiple headings; the (paragraphId,
              // level, title) tuple is unique in practice.
              const key = `o-${p.id}-${meta.level ?? '?'}-${meta.title ?? ''}`;
              return (
                <Group key={key} gap={6} wrap="nowrap" align="center">
                  <Badge size="xs" variant="filled" color="gray">
                    H{meta.level ?? '?'}
                  </Badge>
                  <Text size="sm" fw={600}>
                    {meta.title ?? '(no title)'}
                  </Text>
                </Group>
              );
            })}
            <Text size="xs" c="dimmed">
              ¶{p.order}: {preview}
            </Text>
            {inlines.map((a) => {
              const isBible = a.kind === 'BIBLE';
              const meta = a.metadata as {
                book?: string;
                chapter?: number;
                verse?: number;
                endChapter?: number;
                endVerse?: number;
              };
              const refLabel = isBible
                ? `${meta.book ?? '?'} ${meta.chapter ?? '?'}${
                    meta.verse != null ? `:${meta.verse}` : ''
                  }${meta.endVerse != null ? `-${meta.endVerse}` : ''}${
                    meta.endChapter != null ? `–${meta.endChapter}` : ''
                  }`
                : 'keyword';
              // Word offsets are guaranteed to be set for inline kinds and
              // unique within a paragraph (we never insert overlapping
              // spans), so (paragraphId, kind, startWord) is a stable key.
              const key = `i-${a.paragraphId}-${a.kind}-${a.startWord}`;
              return (
                <Group key={key} gap={6} wrap="nowrap" align="baseline">
                  <Badge
                    size="xs"
                    variant="light"
                    color={isBible ? 'indigo' : 'teal'}
                  >
                    {refLabel}
                  </Badge>
                  <Text size="sm">
                    <em>"{a.rawSpan}"</em>
                  </Text>
                </Group>
              );
            })}
          </Stack>
        );
      })}
      {skippedItems.length > 0 ? (
        // Skipped inline annotations — model emitted them but we
        // couldn't materialize them (span not found in paragraph after
        // exact + fuzzy match, or bible metadata failed validation).
        // Rendered in the same scrolling container, after the matched
        // annotations, so the admin can scroll one list to see both.
        <Stack gap="xs">
          <SectionLabel label="Skipped" muted />
          {skippedItems.map((item, idx) => {
            const paragraph = paragraphsById.get(item.paragraphId);
            const preview = paragraph
              ? paragraph.text.slice(0, 120) +
                (paragraph.text.length > 120 ? '…' : '')
              : `[paragraph ${item.paragraphOrder}]`;
            const isBible = item.kind === 'BIBLE';
            const meta = item.metadata as {
              book?: string | null;
              chapter?: number | null;
              verse?: number | null;
              endChapter?: number | null;
              endVerse?: number | null;
            };
            const refLabel = isBible
              ? `${meta.book ?? '?'} ${meta.chapter ?? '?'}${
                  meta.verse != null ? `:${meta.verse}` : ''
                }${meta.endVerse != null ? `-${meta.endVerse}` : ''}${
                  meta.endChapter != null ? `–${meta.endChapter}` : ''
                }`
              : 'keyword';
            const key = `s-${item.paragraphId}-${item.kind}-${idx}-${item.span.slice(0, 24)}`;
            return (
              <Stack key={key} gap={2}>
                <Group gap={6} wrap="nowrap" align="baseline">
                  <Badge size="xs" variant="light" color="orange">
                    {refLabel}
                  </Badge>
                  <Text size="sm">
                    <em>"{item.span}"</em>
                  </Text>
                  <Tooltip
                    label={
                      item.reason === 'not_found'
                        ? "Couldn't locate this span in the paragraph (exact + fuzzy both missed)"
                        : 'Bible metadata failed validation (missing book or chapter, or unparseable values)'
                    }
                  >
                    <Badge size="xs" variant="outline" color="orange">
                      {item.reason === 'not_found' ? 'not found' : 'bad meta'}
                    </Badge>
                  </Tooltip>
                </Group>
                <Text size="xs" c="dimmed">
                  ¶{item.paragraphOrder}: {preview}
                </Text>
              </Stack>
            );
          })}
        </Stack>
      ) : null}
    </Stack>
  );
}
