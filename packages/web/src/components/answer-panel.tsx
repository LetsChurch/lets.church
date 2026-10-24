import {
  IconChevronRight,
  IconClockHour3,
  IconMessageCircle2,
  IconSearch,
  IconCheck,
  IconCopy,
  IconSparkles,
  IconThumbDown,
  IconThumbDownFilled,
  IconThumbUp,
  IconThumbUpFilled,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Component,
  type ComponentProps,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { defaultRehypePlugins, Streamdown } from 'streamdown';

import {
  type AnswerSource,
  answerSourceKey,
  parseAnswerStream,
} from '@/ai/answer-stream';
import type { SearchAnswerInput } from '@/ai/search-answer.server';
import { rehypeGlueCitations } from '@/components/answer-citation-glue';
import { Avatar } from '@/components/avatar';
import { LcTooltip } from '@/components/lc-tooltip';
import {
  MediaPreviewScope,
  MediaPreviewTarget,
} from '@/components/media-preview-link';
import { useCopied } from '@/hooks/use-copied';
import type { AnswerStreamEvent } from '@/trpc/answer-relay';
import { useTRPC } from '@/trpc/react';
import { formatTime } from '@/util/format';

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Stable per-browser id (anonymous memory scope) + per-tab-session thread id
// (so consecutive questions in a session share conversation memory and
// follow-up pronouns resolve).
export function getResourceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const KEY = 'lc-search-resource';
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export function getThreadId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const KEY = 'lc-search-thread';
  let id = window.sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(KEY, id);
  }
  return id;
}

// Turn a complete tool cite token `[upload:<id>@<sec>]` into an inline citation.
// Used for dig-path answers, whose agent cites sources it discovered. When the
// upload's metadata has arrived (the 's' channel merged it into `sources`), emit
// the numbered `[N](#lc-cite-N)` form so it renders as a hover-preview citation
// badge (avatar + title) and shows in the chip row — matching the cheap path.
// Until then (or on a hydrate miss) fall back to a plain link to the moment.
function linkifyUploadCitations(md: string, sources: AnswerSource[]): string {
  return md.replace(
    /\[upload:([A-Za-z0-9]+)@(\d+)\]/g,
    (_full, id: string, sec: string) => {
      const seconds = Number(sec);
      const i = sources.findIndex(
        (source) => source.id === id && source.startSeconds === seconds,
      );
      return i === -1
        ? `[source](/media/${id}#t=${sec})`
        : `[${i + 1}](#lc-cite-${i + 1})`;
    },
  );
}

// Kept as a compatibility export for callers that used the old component-local
// parser; the protocol itself now lives in the dependency-free answer-stream
// module and is unit tested there.
export const parseStream = parseAnswerStream;

const VISIBLE_SOURCES = 3;

const CITATION_HREF = /^#lc-cite-(\d+)$/;

// Streamdown's defaults (raw/sanitize/harden) plus our citation glue, which runs
// last so its nowrap wrapper isn't sanitized away.
const REHYPE_PLUGINS = [
  ...Object.values(defaultRehypePlugins),
  rehypeGlueCitations,
];

// Turn the model's bare [1] / [1, 2] citation markers into links to
// #lc-cite-N, which the markdown anchor renderer upgrades into hover-preview
// citation badges. Numbers outside the source range are left as plain text.
function linkifyCitations(md: string, count: number): string {
  if (count === 0) return md;
  return md.replace(
    /\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g,
    (full, group: string) => {
      const out = group
        .split(',')
        .map((part) => part.trim())
        .map((n) => {
          const i = Number(n);
          return i >= 1 && i <= count ? `[${n}](#lc-cite-${n})` : null;
        });
      // If none of the numbers map to a source, leave the text untouched.
      return out.every((x) => x === null) ? full : out.filter(Boolean).join('');
    },
  );
}

// The sources sent up front are the full citation map (so any inline [N] badge
// can resolve while streaming). The chip row, though, should list only the
// sources the answer actually cited — derived from the [N] markers present so
// far, in their original order.
function pickCitedSources(
  answer: string,
  sources: AnswerSource[],
): AnswerSource[] {
  const cited = new Set<number>();
  // Cheap path: numbered [N] / [N, M] markers.
  const numRe = /\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g;
  let m: RegExpExecArray | null = numRe.exec(answer);
  while (m !== null) {
    for (const part of m[1].split(',')) {
      const n = Number(part.trim());
      if (n >= 1 && n <= sources.length) cited.add(n);
    }
    m = numRe.exec(answer);
  }
  // Dig path: [upload:id@sec] tokens — one upload can support several distinct
  // moments, so resolve the complete (id, timestamp) identity.
  const upRe = /\[upload:([A-Za-z0-9]+)@(\d+)\]/g;
  m = upRe.exec(answer);
  while (m !== null) {
    const key = `${m[1]}@${Number(m[2])}`;
    const i = sources.findIndex((source) => answerSourceKey(source) === key);
    if (i !== -1) cited.add(i + 1);
    m = upRe.exec(answer);
  }
  return sources.filter((_, i) => cited.has(i + 1));
}

function sourceLabel(s: AnswerSource): string {
  return s.title ?? s.channelName ?? 'Source';
}

const CITATION_BADGE_CLASS =
  'ml-0.5 inline-flex items-center rounded bg-(--answer-ink)/15 px-1 align-super font-medium text-[10px] text-(--answer-ink)/80 no-underline transition-colors hover:bg-(--answer-ink)/25 hover:text-(--answer-ink)';

// An inline citation badge: a superscript number. In `onCite` mode (a single
// video page) it's a button that seeks that page's player to the cited moment;
// otherwise it opens the shared hover preview + deep-links to the moment.
function CitationBadge({
  s,
  n,
  onCite,
}: {
  s: AnswerSource;
  n: number;
  onCite?: (startSeconds: number) => void;
}) {
  if (onCite) {
    return (
      <button
        type="button"
        onClick={() => onCite(s.startSeconds)}
        className={CITATION_BADGE_CLASS}
      >
        {n}
      </button>
    );
  }
  return (
    <MediaPreviewTarget
      mediaId={s.id}
      startSeconds={s.startSeconds}
      thumbnailUrl={s.thumbnailUrl}
      title={sourceLabel(s)}
      className={CITATION_BADGE_CLASS}
    >
      {n}
    </MediaPreviewTarget>
  );
}

// Streamdown ships its own large heading/spacing utilities (text-3xl, mt-6,
// space-y-4, …) baked onto the elements — there's no Tailwind Typography plugin
// in play here. Override the block renderers with compact, UI-matched styles so
// the answer reads like the rest of the app rather than a spaced-out article.
const MARKDOWN_BLOCKS = {
  h1: ({ children }: ComponentProps<'h1'>) => (
    <h1 className="mt-4 mb-1 text-base font-semibold text-(--answer-ink)">
      {children}
    </h1>
  ),
  h2: ({ children }: ComponentProps<'h2'>) => (
    <h2 className="mt-4 mb-1 text-[15px] font-semibold text-(--answer-ink)">
      {children}
    </h2>
  ),
  h3: ({ children }: ComponentProps<'h3'>) => (
    <h3 className="mt-3 mb-1 text-sm font-semibold text-(--answer-ink)">
      {children}
    </h3>
  ),
  h4: ({ children }: ComponentProps<'h4'>) => (
    <h4 className="mt-3 mb-1 text-sm font-semibold text-(--answer-ink)">
      {children}
    </h4>
  ),
  p: ({ children }: ComponentProps<'p'>) => (
    <p className="my-2 text-sm leading-relaxed">{children}</p>
  ),
  ul: ({ children }: ComponentProps<'ul'>) => (
    <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }: ComponentProps<'ol'>) => (
    <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }: ComponentProps<'li'>) => (
    <li className="text-sm leading-relaxed marker:text-(--answer-ink)/50 [&>p]:my-0 [&>p]:inline">
      {children}
    </li>
  ),
  strong: ({ children }: ComponentProps<'strong'>) => (
    <strong className="font-semibold text-(--answer-ink)">{children}</strong>
  ),
  blockquote: ({ children }: ComponentProps<'blockquote'>) => (
    <blockquote className="my-2 border-l-2 border-(--answer-ink)/30 pl-3 text-(--answer-ink)/80 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-(--answer-ink)/20" />,
};

const SOURCE_CHIP_CLASS =
  'inline-flex max-w-[14rem] items-center gap-1.5 rounded-full bg-(--answer-ink)/15 py-1 pr-3 pl-1 font-medium text-(--answer-ink)/80 text-xs no-underline transition-colors hover:bg-(--answer-ink)/25';

// A compact citation chip. In `onCite` mode (a single-video page) every source
// is the same video, so the chip shows just the cited timestamp and seeks this
// page's player. Otherwise it's an avatar + title chip opening the shared
// MiniPlayer hover preview (the cross-library search results).
function SourceChip({
  s,
  onCite,
}: {
  s: AnswerSource;
  onCite?: (startSeconds: number) => void;
}) {
  if (onCite) {
    return (
      <button
        type="button"
        onClick={() => onCite(s.startSeconds)}
        className="inline-flex items-center gap-1 rounded-full bg-(--answer-ink)/15 px-2.5 py-1 text-xs font-medium text-(--answer-ink)/80 tabular-nums transition-colors hover:bg-(--answer-ink)/25"
      >
        <IconClockHour3 size={12} className="shrink-0" aria-hidden="true" />
        {formatTime(s.startSeconds * 1000)}
      </button>
    );
  }
  return (
    <MediaPreviewTarget
      mediaId={s.id}
      startSeconds={s.startSeconds}
      thumbnailUrl={s.thumbnailUrl}
      title={sourceLabel(s)}
      className={SOURCE_CHIP_CLASS}
    >
      <Avatar
        src={s.avatarUrl}
        alt={s.channelName ?? sourceLabel(s)}
        className="size-4 shrink-0"
        fallbackClassName="text-[9px]"
      />
      <span className="truncate">{sourceLabel(s)}</span>
    </MediaPreviewTarget>
  );
}

function SourceChips({
  sources,
  onCite,
}: {
  sources: AnswerSource[];
  onCite?: (startSeconds: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;
  const visible = expanded ? sources : sources.slice(0, VISIBLE_SOURCES);
  const hidden = sources.slice(VISIBLE_SOURCES);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {visible.map((s) => (
        <SourceChip key={answerSourceKey(s)} s={s} onCite={onCite} />
      ))}
      {hidden.length > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1.5 rounded-full bg-(--answer-ink)/15 py-1 pr-3 pl-1 text-xs font-medium text-(--answer-ink)/80 transition-colors hover:bg-(--answer-ink)/25"
        >
          {expanded ? (
            <span className="px-1.5">Show less</span>
          ) : (
            <>
              <span className="flex -space-x-1.5">
                {hidden.slice(0, 2).map((s) => (
                  <Avatar
                    key={answerSourceKey(s)}
                    src={s.avatarUrl}
                    alt=""
                    className="size-4 shrink-0 ring-1 ring-(--answer-ink)/25"
                    fallbackClassName="text-[9px]"
                  />
                ))}
              </span>
              +{hidden.length}
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

// Collapsed height (px) of the answer body: enough for the concise intro, then
// the rest fades out behind a "See more" toggle.
const COLLAPSED_HEIGHT = 112;

// The detective loop's narrated reasoning (candidate searches, contradictions,
// the pivot). While the loop runs (no answer yet) it shows a live ticker — each
// new reasoning line slides + fades into place (Grok-style), with the previous
// line fading out above it. Once the settled answer starts, it collapses to a
// "Show reasoning" toggle that expands the full trail. Renders nothing when
// there's no reasoning (the cheap path).
function ReasoningTrail({
  reasoning,
  answerPresent,
}: {
  reasoning: string;
  answerPresent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lines = useMemo(
    () =>
      reasoning
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    [reasoning],
  );
  if (lines.length === 0) return null;

  // Still thinking: live, animated tail of the reasoning.
  if (!answerPresent) {
    // Show the last two lines: the newest slides/fades in at the bottom, the
    // previous one lingers, faded, above it — masked so it fades off the top.
    const tail = lines.slice(-2);
    return (
      <div className="mb-3">
        <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-(--answer-ink)/70">
          <IconSearch size={12} aria-hidden="true" className="shrink-0" />
          <span className="text-shimmer">Searching…</span>
        </div>
        <div
          className="relative overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_45%)] text-xs leading-relaxed text-(--answer-ink)/70"
          style={{ maxHeight: '2.75rem' }}
          aria-live="polite"
        >
          <div className="flex flex-col justify-end">
            {tail.map((line, i) => {
              const isNewest = i === tail.length - 1;
              // Key by absolute line index so ONLY a genuinely new line remounts
              // and replays the enter animation; an existing line shifting up
              // keeps its key and just changes opacity.
              const absIndex = lines.length - tail.length + i;
              return (
                <div
                  key={absIndex}
                  className={
                    isNewest
                      ? 'lc-thought-in'
                      : 'opacity-45 transition-opacity duration-300'
                  }
                >
                  {line}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Answer present: collapse to a toggle; expanded shows the full trail.
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-normal text-(--answer-ink)/50 transition-colors hover:text-(--answer-ink)/80"
      >
        <IconSearch size={10} aria-hidden="true" className="shrink-0" />
        {open ? 'Hide reasoning' : 'Show reasoning'}
      </button>
      {open ? (
        <div className="mt-2 space-y-0.5 border-l-2 border-(--answer-ink)/25 pl-3 text-xs leading-relaxed text-(--answer-ink)/70">
          {lines.map((line, i) => (
            <div key={`${i}:${line}`}>{line}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type AnswerStatus =
  | 'streaming'
  | 'done'
  | 'error'
  | 'cancelled'
  | 'rate-limited';

// The first (cache-miss) request streams while the server generates the answer;
// on a flaky/slow connection that stream can drop even though the server finishes
// and CACHES the answer (we saw a false decline that vanished on refresh). So
// retry a couple times with backoff — a retry lands on the now-cached answer and
// renders, instead of showing "couldn't generate". The backoff also gives the
// server time to finish + cache before the retry.
const ANSWER_MAX_ATTEMPTS = 3;
const ANSWER_RETRY_MS = 1500;

export type SearchAnswerRequest = (
  input: SearchAnswerInput,
  signal: AbortSignal,
) => Promise<AsyncIterable<AnswerStreamEvent>>;

// The streaming `search.answer` procedure. The tRPC client is loaded on demand
// so this module (and its tests) don't pull in the app's tRPC client setup.
const requestSearchAnswer: SearchAnswerRequest = async (input, signal) => {
  const { trpcClient } = await import('@/trpc/react');
  return trpcClient.search.answer.mutate(input, { signal });
};

// Request the answer and stream it into `onText`, retrying on a dropped/failed
// stream. Returns the final UI status; deliberate throttles do not retry.
// `onText` is reset to '' at the start of each attempt.
export async function streamAnswerWithRetry(
  input: SearchAnswerInput,
  signal: AbortSignal,
  onText: (text: string) => void,
  request: SearchAnswerRequest = requestSearchAnswer,
): Promise<'done' | 'error' | 'rate-limited'> {
  for (let attempt = 0; attempt < ANSWER_MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) return 'error';
    onText('');
    try {
      let acc = '';
      for await (const event of await request(input, signal)) {
        // A deliberate throttle is not a flaky stream. Retrying it would
        // create more load and make the user wait through pointless backoff.
        if (event.type === 'rate-limited') return 'rate-limited';
        acc += event.text;
        onText(acc);
      }
      return 'done';
    } catch {
      if (signal.aborted) return 'error';
    }
    if (attempt < ANSWER_MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, ANSWER_RETRY_MS * (attempt + 1)));
    }
  }
  return 'error';
}

// Isolate the markdown renderer: Streamdown parses the answer as GFM, and a
// markdown/regex edge case there must never take down the whole page (an older
// iPad Safari hit exactly this). On a render throw, fall back to the raw answer
// as plain text — the reader still gets the answer, just unformatted.
class MarkdownBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Playful loading verbs for the shimmering "…" while the answer is being
// generated. A random one is picked each time the card enters its loading state
// so the wait feels a little less monotonous.
const SHIMMER_WORDS = [
  'Analyzing',
  'Beep-booping',
  'Bootstrapping',
  'Buffering',
  'Calculating',
  'Caramelizing',
  'Catapulting',
  'Churning',
  'Combobulating',
  'Composing',
  'Cross-checking',
  'Crunching',
  'Crunching',
  'Discovering',
  'Exploring',
  'Frolicking',
  'Gathering',
  'Kneading',
  'Looking up',
  'Percolating',
  'Processing',
  'Querying',
  'Razzle-dazzing',
  'Researching',
  'Retrieving',
  'Rummaging',
  'Scanning',
  'Searching',
  'Seeking',
  'Shimmering',
  'Spelunking',
  'Triangulating',
  'Verifying',
  'Whirring',
  'Zig-zagging',
];

// Pick a loading verb client-side only: SSR and the first client render both
// use SHIMMER_WORDS[0] (so they agree — a random pick during render would
// hydration-mismatch), then a fresh word is chosen on each entry into the
// seeking state.
function useShimmerWord(seeking: boolean): string {
  const [word, setWord] = useState(SHIMMER_WORDS[0]);
  const wasSeeking = useRef(false);
  useEffect(() => {
    if (seeking && !wasSeeking.current) {
      setWord(SHIMMER_WORDS[Math.floor(Math.random() * SHIMMER_WORDS.length)]);
    }
    wasSeeking.current = seeking;
  }, [seeking]);
  return word;
}

export type AnswerRating = 'LIKE' | 'DISLIKE';

// The answer as plain prose for the clipboard: drop the [upload:id@sec] citation
// tokens the cards and badges are built from.
function answerForClipboard(answer: string): string {
  return answer
    .replace(/\s*\[upload:[^\]]*\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// Colors follow the card's --answer-ink, so the same buttons read on the
// indigo card and on plain Dig Deeper replies.
const ACTION_BUTTON =
  'flex size-8 cursor-pointer items-center justify-center rounded-full text-(--answer-ink)/60 transition-colors hover:bg-(--answer-ink)/10 hover:text-(--answer-ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Copy + thumbs up/down under a finished answer, as in Google's AI Mode.
 * Rating needs the saved answer's id from the stream's terminal frame; an
 * answer without one (a failed save) only offers copy.
 */
function AnswerActions({
  answer,
  answerId,
  initialRating = null,
  onRatingChange,
}: {
  answer: string;
  answerId?: string;
  // A rating already given elsewhere (the search overview handed to Dig
  // Deeper), and a callback so a parent can hand the current one on.
  initialRating?: AnswerRating | null;
  onRatingChange?: (rating: AnswerRating | null) => void;
}) {
  const trpc = useTRPC();
  const { copied, copy } = useCopied();
  const [rating, setRatingState] = useState<AnswerRating | null>(initialRating);
  const setRating = (next: AnswerRating | null) => {
    setRatingState(next);
    onRatingChange?.(next);
  };
  const rate = useMutation({
    mutationFn: trpc.search.rateAnswer.mutationOptions().mutationFn,
    onMutate: (variables) => {
      const previous = rating;
      setRating(variables.rating);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      setRating(context?.previous ?? null);
    },
  });

  const toggle = (next: AnswerRating) => {
    if (!answerId) return;
    rate.mutate({ answerId, rating: rating === next ? null : next });
  };

  return (
    <LcTooltip.Provider>
      <div
        data-testid="answer-actions"
        className="-ml-2 flex items-center gap-0.5"
      >
        <LcTooltip
          content={copied ? 'Copied' : 'Copy'}
          render={(props) => (
            <button
              {...props}
              type="button"
              aria-label="Copy answer"
              className={ACTION_BUTTON}
              onClick={() => void copy(answerForClipboard(answer))}
            >
              {copied ? (
                <IconCheck size={18} aria-hidden="true" />
              ) : (
                <IconCopy size={18} aria-hidden="true" />
              )}
            </button>
          )}
        />
        {answerId ? (
          <>
            <LcTooltip
              content="Good response"
              render={(props) => (
                <button
                  {...props}
                  type="button"
                  aria-label="Good response"
                  aria-pressed={rating === 'LIKE'}
                  disabled={rate.isPending}
                  className={ACTION_BUTTON}
                  onClick={() => toggle('LIKE')}
                >
                  {rating === 'LIKE' ? (
                    <IconThumbUpFilled size={18} aria-hidden="true" />
                  ) : (
                    <IconThumbUp size={18} aria-hidden="true" />
                  )}
                </button>
              )}
            />
            <LcTooltip
              content="Bad response"
              render={(props) => (
                <button
                  {...props}
                  type="button"
                  aria-label="Bad response"
                  aria-pressed={rating === 'DISLIKE'}
                  disabled={rate.isPending}
                  className={ACTION_BUTTON}
                  onClick={() => toggle('DISLIKE')}
                >
                  {rating === 'DISLIKE' ? (
                    <IconThumbDownFilled size={18} aria-hidden="true" />
                  ) : (
                    <IconThumbDown size={18} aria-hidden="true" />
                  )}
                </button>
              )}
            />
          </>
        ) : null}
      </div>
    </LcTooltip.Provider>
  );
}

/**
 * The presentational indigo answer card. Pure: given the answer's `status` and
 * the parsed `answer` + `sources`, it renders the right state — shimmering
 * "Seeking…" while waiting, the streamed markdown (with inline citation badges,
 * a "See more" collapse, and cited-source chips) once text arrives, or an error
 * line. `AnswerPanel` drives it from the live stream; Storybook drives it
 * directly for each state.
 */
export function AnswerCard({
  status,
  answer,
  sources,
  onCite,
  heading,
  reasoning = '',
  hideSourceChips = false,
  errorMessage,
  variant = 'card',
  showActions = false,
  answerId,
  initialRating,
  onRatingChange,
}: {
  status: AnswerStatus;
  answer: string;
  sources: AnswerSource[];
  // When set (single-video page), citations seek THIS page's player instead of
  // opening a hover preview / navigating. Receives the cited start time (seconds).
  onCite?: (startSeconds: number) => void;
  // Optional bold heading shown at the top of the card — used in direct-question
  // mode (the media page) to echo the asked question above its answer.
  heading?: string;
  // The detective (dig) loop's narrated reasoning, streamed above the answer.
  // Empty on the cheap answer/overview path.
  reasoning?: string;
  // Suppress the built-in cited-source chip row — used by the Dig Deeper chat,
  // which renders each turn's sources itself (a sticky rail on desktop, inline
  // cards on mobile) rather than as chips inside the card.
  hideSourceChips?: boolean;
  // Optional endpoint-specific error copy, such as the retry delay supplied by
  // the Dig Deeper rate limiter.
  errorMessage?: string;
  // `card`: the indigo box used where the answer sits among search results or
  // on the media page. `plain`: no box and page-colored text, for replies in the
  // Dig Deeper conversation, where only the user's messages are bubbles (as in
  // Google's AI Mode). A plain reply is never collapsed behind "See more".
  variant?: 'card' | 'plain';
  // Copy + thumbs up/down under a finished answer. Rating also needs
  // `answerId`, the saved answer's id from the stream's terminal frame.
  showActions?: boolean;
  answerId?: string;
  initialRating?: AnswerRating | null;
  onRatingChange?: (rating: AnswerRating | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // Only shimmer when there's nothing to show yet — the reasoning trail is its
  // own "working" indicator on the dig path.
  const shimmerWord = useShimmerWord(
    status === 'streaming' && !answer && !reasoning,
  );

  // Read latest sources + onCite via refs so the (stable) markdown components can
  // look up a citation without rebuilding on every streamed chunk.
  const sourcesRef = useRef<AnswerSource[]>([]);
  sourcesRef.current = sources;
  const onCiteRef = useRef(onCite);
  onCiteRef.current = onCite;
  const components = useMemo(
    () => ({
      ...MARKDOWN_BLOCKS,
      a({ href, children, ...rest }: ComponentProps<'a'>) {
        const match = href?.match(CITATION_HREF);
        if (match) {
          const n = Number(match[1]);
          const s = sourcesRef.current[n - 1];
          if (!s)
            return (
              <sup className="text-[10px] text-(--answer-ink)/50">{n}</sup>
            );
          return <CitationBadge s={s} n={n} onCite={onCiteRef.current} />;
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
          </a>
        );
      },
    }),
    [],
  );
  const renderedAnswer = linkifyCitations(
    linkifyUploadCitations(answer, sources),
    sources.length,
  );

  // Measure whether the answer is tall enough to warrant collapsing. Re-run as
  // the answer streams/changes (scrollHeight is the full height even when the
  // container is clipped).
  useIsomorphicLayoutEffect(() => {
    const el = contentRef.current;
    setOverflowing(el ? el.scrollHeight > COLLAPSED_HEIGHT + 24 : false);
  }, [answer]);

  const plain = variant === 'plain';
  const collapsible = overflowing && !plain;
  const collapsed = collapsible && !expanded;

  // Defensive: the server always sends either a real answer or a concise
  // decline message, so a done-but-empty stream only happens on a truncated
  // response — hide the empty shell rather than spin on "Seeking…". Keep the
  // shell if a dig produced reasoning (the user should still see what it did).
  if (status === 'done' && !answer && !reasoning) return null;

  return (
    // Every color inside derives from --answer-ink: white on the indigo card,
    // the page's text color when plain.
    <div
      className={
        plain
          ? 'text-(--answer-ink) [--answer-ink:var(--color-primary)]'
          : 'border-fancy-pants rounded-2xl bg-indigo-500/90 p-5 text-(--answer-ink) shadow-sm [--answer-ink:var(--color-white)] dark:bg-indigo-500/40'
      }
    >
      {heading ? (
        <h2 className="mb-2 pr-6 text-base leading-snug font-semibold text-(--answer-ink)">
          {heading}
        </h2>
      ) : null}
      <ReasoningTrail reasoning={reasoning} answerPresent={Boolean(answer)} />
      {status === 'error' ? (
        <p className="text-sm text-(--answer-ink)/80">
          {errorMessage ??
            "Sorry — we couldn't generate an answer for this query."}
        </p>
      ) : status === 'rate-limited' ? (
        <p className="text-sm text-(--answer-ink)/80">
          You're asking a little too quickly. Please wait a moment and try
          again.
        </p>
      ) : status === 'cancelled' ? (
        <p className="text-sm text-(--answer-ink)/80">Search stopped.</p>
      ) : answer ? (
        // One preview card for the whole answer — references re-anchor + swap
        // media instantly as you move between citations and chips.
        <MediaPreviewScope side="top">
          <div
            ref={contentRef}
            className={
              collapsed
                ? 'lc-answer-in overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent)]'
                : 'lc-answer-in'
            }
            style={collapsed ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
          >
            <MarkdownBoundary
              fallback={
                <p className="max-w-none text-sm leading-relaxed whitespace-pre-wrap text-(--answer-ink)">
                  {renderedAnswer}
                </p>
              }
            >
              <Streamdown
                parseIncompleteMarkdown
                components={components}
                rehypePlugins={REHYPE_PLUGINS}
                className="max-w-none text-sm leading-relaxed text-(--answer-ink) [&>*+*]:mt-2.5!"
              >
                {renderedAnswer}
              </Streamdown>
            </MarkdownBoundary>
          </div>
          {collapsible ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-medium text-(--answer-ink)/80 transition-colors hover:text-(--answer-ink)"
            >
              {expanded ? 'See less' : 'See more'}
            </button>
          ) : null}
          {hideSourceChips ? null : (
            <SourceChips
              sources={pickCitedSources(answer, sources)}
              onCite={onCite}
            />
          )}
        </MediaPreviewScope>
      ) : reasoning ? null : (
        // The reasoning trail (when digging) is its own working indicator, so
        // only shimmer on the cheap path while waiting for the first token.
        <p className="text-shimmer text-sm">{shimmerWord}…</p>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-(--answer-ink)/75">
        <IconSparkles size={12} aria-hidden="true" className="shrink-0" />
        Generated by AI. Please verify important details.
        <span className="rounded bg-(--answer-ink)/15 px-1 py-px text-[10px] font-semibold tracking-wide text-(--answer-ink)/90 uppercase">
          Beta
        </span>
      </p>
      {showActions && status === 'done' && answer ? (
        <div className="mt-2">
          {/* Keyed by the saved answer so a different answer never inherits
              the previous one's rating state. */}
          <AnswerActions
            key={answerId ?? 'unsaved'}
            answer={answer}
            answerId={answerId}
            initialRating={initialRating}
            onRatingChange={onRatingChange}
          />
        </div>
      ) : null}
    </div>
  );
}

// The search filters pre-filled on the URL when the query loaded (a subset of
// the route's search params — the ones the answer's retrieval can scope to).
export type AnswerFilters = {
  channelSlugs?: ReadonlyArray<string>;
  speakers?: ReadonlyArray<string>;
  bibleRefs?: ReadonlyArray<string>;
  bibleBooks?: ReadonlyArray<string>;
  dateRange?: string;
  dateStart?: string;
  dateEnd?: string;
};

type AnswerInputFilters = NonNullable<SearchAnswerInput['filters']>;
type AnswerDateRange = NonNullable<AnswerInputFilters['dateRange']>;

// Date buckets `search.answer` scopes retrieval to (its input enum).
const ANSWER_DATE_RANGES: ReadonlySet<string> = new Set<AnswerDateRange>([
  'all-time',
  'today',
  'this-week',
  'this-month',
  'this-year',
]);

// The URL's pre-filled filters as `search.answer` input: arrays copied (the
// route params are readonly) and an unrecognized date bucket dropped rather
// than failing the whole request.
function answerInputFilters(filters: AnswerFilters): AnswerInputFilters {
  const copy = (values?: ReadonlyArray<string>) =>
    values ? [...values] : undefined;
  return {
    channelSlugs: copy(filters.channelSlugs),
    speakers: copy(filters.speakers),
    bibleRefs: copy(filters.bibleRefs),
    bibleBooks: copy(filters.bibleBooks),
    dateRange:
      filters.dateRange && ANSWER_DATE_RANGES.has(filters.dateRange)
        ? (filters.dateRange as AnswerDateRange)
        : undefined,
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
  };
}

export function AnswerPanel({
  q,
  searchLogId,
  ready = true,
  filters,
  facetOnly = false,
}: {
  q: string;
  searchLogId?: string | null;
  // Gates the fetch (not the render): the card shows "Seeking…" immediately, but
  // we hold the request until THIS query's page 0 is in (so `searchLogId` is the
  // current query's row, not a stale placeholder). The answer is framed on the
  // raw query `q` — we don't wait on (or use) the slower parse, which would lag
  // a query behind and answer the previous search.
  ready?: boolean;
  // Filters to scope the answer's retrieval to (e.g. a channel slug pre-filled
  // when searching from a channel page). Captured via ref at fire time, so
  // selecting a NEW filter afterward updates the results but does NOT regenerate
  // the answer — it stays bound to the filters present when the query loaded.
  filters?: AnswerFilters;
  // Facet-only browse: `q` is a synthesized description of the active facet
  // (e.g. a verse label), not a user question. The facet already guarantees
  // grounded, on-topic sources, so the server skips its relevance-floor decline
  // and always produces an overview of the facet-matched media.
  facetOnly?: boolean;
}) {
  const [text, setText] = useState('');
  // The viewer's rating of this answer, handed on to Dig Deeper.
  const [rating, setRating] = useState<AnswerRating | null>(null);
  const [status, setStatus] = useState<AnswerStatus>('streaming');
  const abortRef = useRef<AbortController | null>(null);
  // Read via ref so the fetch effect (keyed on q) picks up the id without
  // re-firing when it resolves a tick after mount.
  const searchLogIdRef = useRef(searchLogId);
  searchLogIdRef.current = searchLogId;
  // Same: capture filters via ref so a later filter change doesn't re-fire the
  // effect (its deps are [q, ready]) — the answer follows only the pre-filled set.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setText('');
    setRating(null);
    setStatus('streaming');

    (async () => {
      const result = await streamAnswerWithRetry(
        {
          query: q,
          threadId: getThreadId(),
          resourceId: getResourceId(),
          searchLogId: searchLogIdRef.current ?? null,
          filters: filtersRef.current
            ? answerInputFilters(filtersRef.current)
            : null,
          facetOnly,
        },
        controller.signal,
        setText,
      );
      if (!controller.signal.aborted) setStatus(result);
    })();

    return () => controller.abort();
  }, [q, ready, facetOnly]);

  const { answer, reasoning, sources, terminal } = parseStream(text);

  // Once an answer has settled (and this isn't a facet browse), offer to continue
  // in the Dig Deeper chat — a multi-turn conversation that searches the whole
  // library hard on every turn, seeded with this question. Shown even when the
  // overview already auto-dug (has reasoning): the chat is a follow-up surface, so
  // it's still useful — unlike the old in-place re-fire, which was pointless once
  // the loop had run.
  const canDeepen = shouldOfferDigDeeper(status, facetOnly, answer);

  return (
    <div>
      <AnswerCard
        status={status}
        answer={answer}
        sources={sources}
        reasoning={reasoning}
        showActions
        answerId={terminal?.status === 'done' ? terminal.answerId : undefined}
        onRatingChange={setRating}
      />
      {canDeepen ? (
        <Link
          to="/dig-deeper"
          search={{ q }}
          state={(previous) => ({
            ...previous,
            digDeeperSeed: { question: q, raw: text, rating },
          })}
          className="lc-continue-in group mt-3 flex w-full items-center gap-3 rounded-2xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-3 text-left transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/10 dark:border-indigo-400/15 dark:bg-indigo-400/5 dark:hover:border-indigo-400/30 dark:hover:bg-indigo-400/10"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 transition-colors group-hover:bg-indigo-500/15 dark:bg-indigo-400/10 dark:text-indigo-300 dark:group-hover:bg-indigo-400/15">
            <IconMessageCircle2 size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-primary block text-sm font-medium">
              Continue in Dig Deeper
            </span>
            <span className="text-muted mt-0.5 block text-xs">
              Ask a follow-up with this answer and its sources already in
              context.
            </span>
          </span>
          <IconChevronRight
            size={17}
            aria-hidden="true"
            className="text-muted shrink-0 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      ) : null}
    </div>
  );
}

export function shouldOfferDigDeeper(
  status: AnswerStatus,
  facetOnly: boolean,
  answer: string,
): boolean {
  return status === 'done' && !facetOnly && Boolean(answer);
}

// Per-video, per-tab-session thread so follow-up asks about the SAME video share
// conversation memory, kept separate from the library-search thread.
function getVideoThreadId(mediaId: string): string {
  if (typeof window === 'undefined') return 'ssr';
  const KEY = `lc-video-ask-thread:${mediaId}`;
  let id = window.sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(KEY, id);
  }
  return id;
}

/**
 * The "ask about this video" answer view, shown inside the media transcript
 * sidebar (replacing the transcript list). Streams `search.answer` with the
 * `uploadId` set so retrieval is scoped to this one video, and wires citations to
 * seek the page's player via `onCite`. Re-streams whenever `question` changes.
 */
export function VideoAnswerPanel({
  mediaId,
  question,
  onCite,
}: {
  mediaId: string;
  question: string;
  onCite: (startSeconds: number) => void;
}) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<AnswerStatus>('streaming');

  useEffect(() => {
    const controller = new AbortController();
    setText('');
    setStatus('streaming');

    (async () => {
      const result = await streamAnswerWithRetry(
        {
          query: question,
          uploadId: mediaId,
          threadId: getVideoThreadId(mediaId),
          resourceId: getResourceId(),
        },
        controller.signal,
        setText,
      );
      if (!controller.signal.aborted) setStatus(result);
    })();

    return () => controller.abort();
  }, [mediaId, question]);

  const { answer, sources, terminal } = parseStream(text);

  return (
    <AnswerCard
      status={status}
      answer={answer}
      sources={sources}
      heading={question}
      onCite={onCite}
      showActions
      answerId={terminal?.status === 'done' ? terminal.answerId : undefined}
    />
  );
}
