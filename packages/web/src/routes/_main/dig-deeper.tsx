import { Collapsible } from '@base-ui/react/collapsible';
import {
  IconArrowUp,
  IconChevronDown,
  IconSparkles,
} from '@tabler/icons-react';
import { createFileRoute, useLocation } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import {
  type AnswerSource,
  answerSourceKey,
  parseAnswerStream,
} from '@/ai/answer-stream';
import {
  type DigDeeperTurnRequest,
  requestDigDeeperTurn,
} from '@/ai/dig-deeper-client';
import {
  buildDigDeeperMessages,
  type DigDeeperHistoryTurn,
} from '@/ai/dig-deeper-history';
import {
  type DigDeeperSeed,
  digDeeperSeedFromHistoryState,
} from '@/ai/dig-deeper-seed';
import {
  AnswerCard,
  getResourceId,
  getThreadId,
} from '@/components/answer-panel';
import { Avatar } from '@/components/avatar';
import MainLayout from '@/components/main-layout';
import {
  MediaPreviewGroup,
  MediaPreviewScope,
  MediaPreviewTarget,
} from '@/components/media-preview-link';
import { formatTime } from '@/util/format';

// One conversational exchange: the user's question and the raw streamed response
// (parsed with the shared `parseStream` into answer / reasoning / sources — the
// same wire format the search-answer dig path emits).
type Turn = DigDeeperHistoryTurn & {
  id: string;
};

export const Route = createFileRoute('/_main/dig-deeper')({
  component: RouteComponent,
  // The overview seed lives in browser history state, which is unavailable to
  // the server on reload. Rendering this route client-only keeps the first
  // render consistent and avoids replacing a mismatched hydrated subtree.
  ssr: false,
  validateSearch: z.object({
    // Seed the first turn (e.g. from the search overview's "Dig deeper" button).
    q: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Dig Deeper - Let's Church" },
      {
        name: 'description',
        content:
          "Ask Let's Church a question and dig deeper — a conversational search that grounds every answer in the sermon and teaching library.",
      },
    ],
  }),
});

function RouteComponent() {
  const { q } = Route.useSearch();
  const routeSeed = useLocation({
    select: (location) => digDeeperSeedFromHistoryState(location.state),
  });
  // A history snapshot belongs to the query that created it. If somebody
  // replaces only ?q=, ignore the stale snapshot and use the direct-link path.
  const initialTurn =
    routeSeed && (!q || routeSeed.question === q) ? routeSeed : undefined;
  return (
    <MainLayout containerClassName="mx-auto max-w-7xl px-4 py-4">
      <DigDeeperChat
        initialQ={initialTurn?.question ?? q}
        initialTurn={initialTurn}
      />
    </MainLayout>
  );
}

// A single source rendered as a rich, hover-previewable card in the rail (desktop)
// or the inline strip (mobile). Reuses the shared MediaPreview hover player.
function SourceCard({ source }: { source: AnswerSource }) {
  return (
    <MediaPreviewTarget
      mediaId={source.id}
      startSeconds={source.startSeconds}
      thumbnailUrl={source.thumbnailUrl}
      title={source.title ?? source.channelName ?? 'Source'}
      className="group flex gap-3 rounded-xl border border-black/5 bg-zinc-50 p-2 transition-colors hover:border-black/10 hover:bg-zinc-100 dark:border-white/5 dark:bg-white/5 dark:hover:border-white/10 dark:hover:bg-white/10"
    >
      <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
        {source.thumbnailUrl ? (
          <img
            src={source.thumbnailUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : null}
        <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 py-px text-[10px] font-medium text-white tabular-nums">
          {formatTime(source.startSeconds * 1000)}
        </span>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-primary line-clamp-2 text-[13px] leading-tight font-medium">
          {source.title ?? 'Untitled'}
        </p>
        <span className="text-muted mt-1.5 flex items-center gap-1.5 text-[11px]">
          <Avatar
            src={source.avatarUrl}
            alt={source.channelName ?? ''}
            className="size-3.5 shrink-0"
            fallbackClassName="text-[8px]"
          />
          <span className="truncate">{source.channelName ?? 'Unknown'}</span>
        </span>
      </div>
    </MediaPreviewTarget>
  );
}

function SourceRail({ sources }: { sources: AnswerSource[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleSources = sources.slice(0, 3);
  const additionalSources = sources.slice(3);

  return (
    <MediaPreviewScope side="left">
      <Collapsible.Root open={expanded} onOpenChange={setExpanded}>
        <div
          data-testid="dig-deeper-visible-sources"
          className="flex flex-col gap-2"
        >
          {visibleSources.map((source) => (
            <SourceCard key={answerSourceKey(source)} source={source} />
          ))}
        </div>

        {additionalSources.length > 0 ? (
          <>
            {!expanded ? (
              <div
                data-testid="dig-deeper-source-fade"
                aria-hidden="true"
                inert
                className="pointer-events-none mt-2 max-h-28 overflow-hidden [mask-image:linear-gradient(to_bottom,black_0%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,transparent_100%)]"
              >
                <div className="flex flex-col gap-2">
                  {additionalSources.slice(0, 2).map((source) => (
                    <SourceCard key={answerSourceKey(source)} source={source} />
                  ))}
                </div>
              </div>
            ) : null}

            <Collapsible.Panel
              data-testid="dig-deeper-source-panel"
              className="h-[var(--collapsible-panel-height)] overflow-hidden opacity-100 transition-[height,opacity] duration-300 ease-out data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0"
            >
              <div className="flex flex-col gap-2 pt-2">
                {additionalSources.map((source) => (
                  <SourceCard key={answerSourceKey(source)} source={source} />
                ))}
              </div>
            </Collapsible.Panel>

            <Collapsible.Trigger
              type="button"
              className="text-muted hover:text-primary group mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              {expanded
                ? 'Show fewer sources'
                : `Show ${additionalSources.length} more ${additionalSources.length === 1 ? 'source' : 'sources'}`}
              <IconChevronDown
                size={14}
                aria-hidden="true"
                className="transition-transform duration-200 group-data-[panel-open]:rotate-180"
              />
            </Collapsible.Trigger>
          </>
        ) : null}
      </Collapsible.Root>
    </MediaPreviewScope>
  );
}

export function DigDeeperChat({
  initialQ,
  initialTurn,
  requestTurn = requestDigDeeperTurn,
}: {
  initialQ?: string;
  initialTurn?: DigDeeperSeed;
  requestTurn?: DigDeeperTurnRequest;
}) {
  const [turns, setTurns] = useState<Turn[]>(() =>
    initialTurn
      ? [
          {
            id: 'overview',
            question: initialTurn.question,
            raw: initialTurn.raw,
            status: 'done',
          },
        ]
      : [],
  );
  const [input, setInput] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const deferredUnmountAbortRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const turnsRef = useRef<Turn[]>(turns);
  turnsRef.current = turns;
  const turnEls = useRef<Array<HTMLDivElement | null>>([]);
  // A handed-off overview is already turn one. Only direct ?q= visits need to
  // generate it; clicking the overview action must not repeat that work.
  const startedRef = useRef(Boolean(initialTurn));
  const pendingScrollTurnIdRef = useRef<string | null>(null);

  const parsedTurns = turns.map((t) => ({
    turn: t,
    ...parseAnswerStream(t.raw),
  }));
  const isStreaming = turns.some((t) => t.status === 'streaming');

  const send = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // History is client-held and resent each turn. Keep only whole recent
      // exchanges that fit the endpoint cap; failed partial assistant output is
      // intentionally excluded.
      const messages = buildDigDeeperMessages(turnsRef.current, question);

      const id = crypto.randomUUID();
      setTurns((prev) => [
        ...prev,
        { id, question, raw: '', status: 'streaming' },
      ]);
      pendingScrollTurnIdRef.current = id;

      try {
        const terminal = await requestTurn({
          messages,
          threadId: getThreadId(),
          resourceId: getResourceId(),
          signal: controller.signal,
          onText: (raw) => {
            setTurns((prev) =>
              prev.map((turn) => (turn.id === id ? { ...turn, raw } : turn)),
            );
          },
        });
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  status:
                    terminal.status === 'done'
                      ? 'done'
                      : terminal.status === 'cancelled'
                        ? 'cancelled'
                        : 'error',
                }
              : turn,
          ),
        );
      } catch {
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  status: controller.signal.aborted ? 'cancelled' : 'error',
                }
              : turn,
          ),
        );
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [requestTurn],
  );

  // Seed the first turn from ?q= (once). The composer stays for follow-ups.
  useEffect(() => {
    if (initialQ && !startedRef.current) {
      startedRef.current = true;
      void send(initialQ);
    }
  }, [initialQ, send]);

  // Cancel real navigation-away so the server/provider do not keep spending on
  // an answer nobody can read. StrictMode immediately replays setup after its
  // synthetic cleanup, so defer the abort one task and cancel that timer on the
  // replay; this preserves the seeded request during development/router remounts.
  useEffect(() => {
    if (deferredUnmountAbortRef.current) {
      clearTimeout(deferredUnmountAbortRef.current);
      deferredUnmountAbortRef.current = null;
    }
    return () => {
      deferredUnmountAbortRef.current = setTimeout(() => {
        abortRef.current?.abort();
        deferredUnmountAbortRef.current = null;
      }, 0);
    };
  }, []);

  // State commits before effects, so the new turn element exists here. Scrolling
  // the element into view targets its nearest scrollable ancestor — the layout's
  // <main> — rather than the non-scrolling window/document body.
  useEffect(() => {
    const pendingId = pendingScrollTurnIdRef.current;
    if (!pendingId) return;
    const index = turns.findIndex((turn) => turn.id === pendingId);
    const element = index === -1 ? null : turnEls.current[index];
    if (!element) return;
    pendingScrollTurnIdRef.current = null;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [turns]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isStreaming) return;
    const q = input;
    setInput('');
    void send(q);
  };

  return (
    <MediaPreviewGroup>
      <div className="flex min-h-[calc(100dvh-var(--header-height)-2rem)] flex-col">
        <div className="mb-6">
          <h1 className="text-primary flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <IconSparkles
              size={22}
              className="text-indigo-500 dark:text-white"
              aria-hidden="true"
            />
            Dig Deeper
          </h1>
          <p className="text-muted mt-1 max-w-2xl text-sm">
            Ask a question, then keep asking follow-ups. Each answer searches
            the whole library.
          </p>
        </div>

        <div className="space-y-10">
          {parsedTurns.length === 0 ? (
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
              <div className="min-w-0">
                <DigDeeperEmpty onPick={(qq) => void send(qq)} />
              </div>
            </div>
          ) : null}

          {parsedTurns.map(({ turn, answer, reasoning, sources }, i) => (
            <div
              key={turn.id}
              ref={(el) => {
                turnEls.current[i] = el;
              }}
              data-testid={`dig-deeper-turn-${turn.id}`}
              className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8"
            >
              <div className="min-w-0 space-y-3">
                {/* User question */}
                <div className="flex justify-end">
                  <p className="text-primary max-w-[80%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2 text-sm dark:bg-white/10">
                    {turn.question}
                  </p>
                </div>

                {/* Assistant answer — its sources sit beside this message on
                    desktop and directly underneath it on mobile. */}
                <AnswerCard
                  status={turn.status}
                  answer={answer}
                  reasoning={reasoning}
                  sources={sources}
                  hideSourceChips
                />
              </div>

              {sources.length > 0 ? (
                <aside
                  data-testid={`dig-deeper-sources-${turn.id}`}
                  className="mt-3 lg:sticky lg:top-4 lg:mt-0 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto"
                >
                  <p className="text-muted mb-3 px-1 text-[11px] font-medium tracking-wide uppercase">
                    Sources
                  </p>
                  <SourceRail sources={sources} />
                </aside>
              ) : null}
            </div>
          ))}
        </div>

        {/* Composer follows the conversation and shares its desktop grid, so it
            naturally stays inside the page's main content column. */}
        <form
          onSubmit={onSubmit}
          data-testid="dig-deeper-composer"
          className="sticky bottom-0 z-20 mt-auto bg-gradient-to-t from-white via-white to-transparent pt-8 pb-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 dark:from-zinc-950 dark:via-zinc-950"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-2 shadow-lg dark:border-white/10 dark:bg-zinc-900">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                turns.length === 0 ? 'Ask a question…' : 'Ask a follow-up…'
              }
              aria-label="Ask a question"
              className="text-primary min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
            />
            <button
              type="submit"
              disabled={isStreaming || input.trim().length === 0}
              aria-label="Send"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconArrowUp size={18} />
            </button>
          </div>
        </form>
      </div>
    </MediaPreviewGroup>
  );
}

const STARTER_QUESTIONS = [
  'What is the regulative principle of worship?',
  'How does James White respond to Jehovah’s Witnesses?',
  'What does the Bible teach about grace-based giving?',
];

function DigDeeperEmpty({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-zinc-50 p-6 dark:border-white/5 dark:bg-white/5">
      <p className="text-primary text-sm font-medium">Start digging</p>
      <p className="text-muted mt-1 text-sm">
        Every answer is grounded in the library and cited. Try one of these:
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {STARTER_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="text-primary rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-white/10 dark:bg-white/5 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
