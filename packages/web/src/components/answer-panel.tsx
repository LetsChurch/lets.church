import { IconSparkles } from '@tabler/icons-react';
import {
  type ComponentProps,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Streamdown } from 'streamdown';
import { type AnswerSource, SOURCES_DELIMITER } from '@/ai/answer-stream';
import { Avatar } from '@/components/avatar';
import {
  MediaPreviewScope,
  MediaPreviewTarget,
} from '@/components/media-preview-link';

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Stable per-browser id (anonymous memory scope) + per-tab-session thread id
// (so consecutive questions in a session share conversation memory and
// follow-up pronouns resolve).
function getResourceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const KEY = 'lc-search-resource';
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

function getThreadId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const KEY = 'lc-search-thread';
  let id = window.sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(KEY, id);
  }
  return id;
}

// The model shouldn't emit inline [upload:…] tokens anymore (sources render as
// chips), but strip any (complete or trailing-partial) defensively so they
// never flash in the prose.
function stripCitations(text: string): string {
  return (
    text
      .replace(/\s*\[upload:[^\]]*\]/g, '')
      .replace(/\s*\[upload:[^\]]*$/, '')
      // The model occasionally emits empty/whitespace-only citation brackets;
      // drop them so a stray "[]" never shows in the prose.
      .replace(/\s*\[\s*\]/g, '')
  );
}

// The stream is `<JSON sources><DELIMITER><answer markdown>`. Sources lead so
// inline [N] citations can resolve to a source while the answer is still
// streaming. Until the delimiter arrives the leading bytes are the sources
// JSON (not prose), so hold the answer empty.
function parseStream(raw: string): { answer: string; sources: AnswerSource[] } {
  const idx = raw.indexOf(SOURCES_DELIMITER);
  if (idx === -1) return { answer: '', sources: [] };
  let sources: AnswerSource[] = [];
  try {
    const parsed = JSON.parse(raw.slice(0, idx));
    if (Array.isArray(parsed)) sources = parsed;
  } catch {
    // sources block not fully received yet
  }
  return {
    answer: stripCitations(raw.slice(idx + SOURCES_DELIMITER.length)),
    sources,
  };
}

const VISIBLE_SOURCES = 3;

const CITATION_HREF = /^#lc-cite-(\d+)$/;

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
  const re = /\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g;
  let m: RegExpExecArray | null = re.exec(answer);
  while (m !== null) {
    for (const part of m[1].split(',')) {
      const n = Number(part.trim());
      if (n >= 1 && n <= sources.length) cited.add(n);
    }
    m = re.exec(answer);
  }
  return sources.filter((_, i) => cited.has(i + 1));
}

function sourceLabel(s: AnswerSource): string {
  return s.title ?? s.channelName ?? 'Source';
}

// An inline citation badge: a superscript number that opens the same hover
// preview as the source chips and deep-links to the cited moment.
function CitationBadge({ s, n }: { s: AnswerSource; n: number }) {
  return (
    <MediaPreviewTarget
      mediaId={s.id}
      startSeconds={s.startSeconds}
      thumbnailUrl={s.thumbnailUrl}
      title={sourceLabel(s)}
      className="ml-0.5 inline-flex items-center rounded bg-white/15 px-1 align-super font-medium text-[10px] text-white/80 no-underline transition-colors hover:bg-white/25 hover:text-white"
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
    <h1 className="mt-4 mb-1 font-semibold text-base text-white">{children}</h1>
  ),
  h2: ({ children }: ComponentProps<'h2'>) => (
    <h2 className="mt-4 mb-1 font-semibold text-[15px] text-white">
      {children}
    </h2>
  ),
  h3: ({ children }: ComponentProps<'h3'>) => (
    <h3 className="mt-3 mb-1 font-semibold text-sm text-white">{children}</h3>
  ),
  h4: ({ children }: ComponentProps<'h4'>) => (
    <h4 className="mt-3 mb-1 font-semibold text-sm text-white">{children}</h4>
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
    <li className="text-sm leading-relaxed marker:text-white/50 [&>p]:my-0 [&>p]:inline">
      {children}
    </li>
  ),
  strong: ({ children }: ComponentProps<'strong'>) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  blockquote: ({ children }: ComponentProps<'blockquote'>) => (
    <blockquote className="my-2 border-white/30 border-l-2 pl-3 text-white/80 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-white/20" />,
};

// A compact citation chip (avatar + title) shown in the row. Hovering opens the
// same MiniPlayer preview as transcript-result segments.
function SourceChip({ s }: { s: AnswerSource }) {
  return (
    <MediaPreviewTarget
      mediaId={s.id}
      startSeconds={s.startSeconds}
      thumbnailUrl={s.thumbnailUrl}
      title={sourceLabel(s)}
      className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-full bg-white/15 py-1 pr-3 pl-1 font-medium text-white/80 text-xs no-underline transition-colors hover:bg-white/25"
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

function SourceChips({ sources }: { sources: AnswerSource[] }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;
  const visible = expanded ? sources : sources.slice(0, VISIBLE_SOURCES);
  const hidden = sources.slice(VISIBLE_SOURCES);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {visible.map((s) => (
        <SourceChip key={s.id} s={s} />
      ))}
      {hidden.length > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pr-3 pl-1 font-medium text-white/80 text-xs transition-colors hover:bg-white/25"
        >
          {expanded ? (
            <span className="px-1.5">Show less</span>
          ) : (
            <>
              <span className="-space-x-1.5 flex">
                {hidden.slice(0, 2).map((s) => (
                  <Avatar
                    key={s.id}
                    src={s.avatarUrl}
                    alt=""
                    className="size-4 shrink-0 ring-1 ring-white/25"
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

export type AnswerStatus = 'streaming' | 'done' | 'error';

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
}: {
  status: AnswerStatus;
  answer: string;
  sources: AnswerSource[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Read latest sources via a ref so the (stable) markdown components can look
  // up a citation's source without rebuilding on every streamed chunk.
  const sourcesRef = useRef<AnswerSource[]>([]);
  sourcesRef.current = sources;
  const components = useMemo(
    () => ({
      ...MARKDOWN_BLOCKS,
      a({ href, children, ...rest }: ComponentProps<'a'>) {
        const match = href?.match(CITATION_HREF);
        if (match) {
          const n = Number(match[1]);
          const s = sourcesRef.current[n - 1];
          if (!s) return <sup className="text-[10px] text-white/50">{n}</sup>;
          return <CitationBadge s={s} n={n} />;
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
  const renderedAnswer = linkifyCitations(answer, sources.length);

  // Measure whether the answer is tall enough to warrant collapsing. Re-run as
  // the answer streams/changes (scrollHeight is the full height even when the
  // container is clipped).
  useIsomorphicLayoutEffect(() => {
    const el = contentRef.current;
    setOverflowing(el ? el.scrollHeight > COLLAPSED_HEIGHT + 24 : false);
  }, [answer]);

  const collapsed = overflowing && !expanded;

  // Defensive: the server always sends either a real answer or a concise
  // decline message, so a done-but-empty stream only happens on a truncated
  // response — hide the empty shell rather than spin on "Seeking…".
  if (status === 'done' && !answer) return null;

  return (
    <div className="rounded-2xl border-fancy-pants bg-indigo-500/40 p-5 text-white shadow-sm">
      {status === 'error' ? (
        <p className="text-sm text-white/80">
          Sorry — we couldn't generate an answer for this query.
        </p>
      ) : answer ? (
        // One preview card for the whole answer — references re-anchor + swap
        // media instantly as you move between citations and chips.
        <MediaPreviewScope side="top">
          <div
            ref={contentRef}
            className={
              collapsed
                ? 'overflow-hidden [-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent)] [mask-image:linear-gradient(to_bottom,black_60%,transparent)]'
                : undefined
            }
            style={collapsed ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
          >
            <Streamdown
              parseIncompleteMarkdown
              components={components}
              className="max-w-none text-sm text-white leading-relaxed [&>*+*]:mt-2.5!"
            >
              {renderedAnswer}
            </Streamdown>
          </div>
          {overflowing ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 font-medium text-white/80 text-xs transition-colors hover:text-white"
            >
              {expanded ? 'See less' : 'See more'}
            </button>
          ) : null}
          <SourceChips sources={pickCitedSources(answer, sources)} />
        </MediaPreviewScope>
      ) : (
        <p className="text-shimmer text-sm">Seeking…</p>
      )}
      <p className="mt-3 flex items-center gap-1 text-white/50 text-xs">
        <IconSparkles size={12} aria-hidden="true" className="shrink-0" />
        Generated by AI. Please verify important details.
      </p>
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

export function AnswerPanel({
  q,
  searchLogId,
  ready = true,
  filters,
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
}) {
  const [text, setText] = useState('');
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
    setStatus('streaming');

    (async () => {
      try {
        const res = await fetch('/api/search-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: q,
            threadId: getThreadId(),
            resourceId: getResourceId(),
            searchLogId: searchLogIdRef.current ?? null,
            filters: filtersRef.current ?? null,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setStatus('error');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          setText((prev) => prev + decoder.decode(value, { stream: true }));
        }
        setStatus('done');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    })();

    return () => controller.abort();
  }, [q, ready]);

  const { answer, sources } = parseStream(text);

  return <AnswerCard status={status} answer={answer} sources={sources} />;
}
