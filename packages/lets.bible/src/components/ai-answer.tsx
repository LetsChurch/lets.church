import { Link } from '@tanstack/react-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { CHANNEL_MARK } from '@/ai/answer-stream';
import { parseReference, passageLink } from '@/lib/reference';

type Status = 'idle' | 'streaming' | 'done' | 'error';

// Collapsed max height (px) before the "Show more" toggle. Answers taller than
// this fade out and expand on click, matching the lets.church answer card.
const COLLAPSED_HEIGHT = 220;

// A small inline magnifier glyph — lets.bible carries no icon dependency, so the
// reasoning trail draws its own (theme-inheriting via currentColor).
function SearchGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" />
    </svg>
  );
}

// The stream body is EITHER plain answer markdown (the cheap topical path) OR,
// on the verse-finder dig path, a sequence of channel-tagged segments
// (`CHANNEL_MARK + 'r'|'a' + text`) — 'r' = the reasoning stream, 'a' = the
// answer. Detect the dig shape by CHANNEL_MARK (it can't appear in markdown).
function parseStream(raw: string): { answer: string; reasoning: string } {
  if (!raw.includes(CHANNEL_MARK)) {
    return { answer: raw, reasoning: '' };
  }
  let reasoning = '';
  let answer = '';
  for (const seg of raw.split(CHANNEL_MARK)) {
    if (!seg) continue;
    const channel = seg[0];
    const text = seg.slice(1);
    if (channel === 'r') reasoning += text;
    else if (channel === 'a') answer += text;
  }
  return { answer, reasoning: reasoning.trimEnd() };
}

// Turn inline [Book Chapter:Verse] citations into router links into the reader.
// Anything that doesn't parse to a real reference (e.g. a hallucinated ref) is
// left as plain text — never linked — so a bad citation can't send the reader to
// a fabricated place.
function renderParagraph(text: string, q: string, translation?: string) {
  const parts = text.split(/(\[[^\]\n]+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]\n]+)\]$/);
    if (m && parseReference(m[1])) {
      return (
        <Link
          key={i}
          {...passageLink(m[1])}
          search={(previous) => ({
            ...previous,
            fromSearch: q,
            ...(translation ? { fromTranslation: translation } : {}),
          })}
          className="bg-gold-soft/15 text-gold hover:bg-gold-soft/25 rounded px-1 font-medium whitespace-nowrap no-underline"
        >
          {m[1]}
        </Link>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// The verse-finder loop's narrated reasoning (which strategies it ran, what it
// found). While the loop runs (no answer yet) it shows a live ticker — each new
// line slides + fades into place (Grok-style), the previous line lingering,
// faded, above it. Once the answer starts it collapses to a subtle "Show
// reasoning" toggle. Renders nothing on the cheap path (no reasoning).
function ReasoningTrail({
  reasoning,
  answerPresent,
  isStreaming,
}: {
  reasoning: string;
  answerPresent: boolean;
  // Whether the request is still in flight. The live "Searching…" ticker keys on
  // this AND the absence of an answer, so a dig that settles (done/error) with
  // reasoning but no answer collapses to the toggle instead of spinning forever.
  isStreaming: boolean;
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
  if (isStreaming && !answerPresent) {
    const tail = lines.slice(-2);
    return (
      <div className="mb-3">
        <div className="text-muted mb-1 inline-flex items-center gap-1.5 text-[12px] font-medium">
          <SearchGlyph />
          <span className="text-shimmer">Searching Scripture…</span>
        </div>
        <div
          className="text-muted relative overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_45%)] text-[12px] leading-relaxed"
          style={{ maxHeight: '2.75rem' }}
          aria-live="polite"
        >
          <div className="flex flex-col justify-end">
            {tail.map((line, i) => {
              const isNewest = i === tail.length - 1;
              // Key by absolute line index so only a genuinely new line remounts
              // and replays the enter animation; a line shifting up keeps its key.
              const absIndex = lines.length - tail.length + i;
              return (
                <div
                  key={absIndex}
                  className={
                    isNewest
                      ? 'lb-thought-in'
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
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-faint hover:text-muted inline-flex items-center gap-1 text-[11px] font-normal transition-colors"
      >
        <SearchGlyph size={10} />
        {open ? 'Hide reasoning' : 'Show reasoning'}
      </button>
      {open ? (
        <div className="border-gold-soft/40 text-muted mt-2 space-y-0.5 border-l-2 pl-3 text-[12px] leading-relaxed">
          {lines.map((line, i) => (
            <div key={`${i}:${line}`}>{line}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Streaming, cited AI answer over Scripture. Fires for topical/question queries
// AND half-remembered-verse recollections (the server gates which path runs).
// Skips bare references — those get the "go to reference" card. POSTs the query
// to /api/answer and renders the streamed answer (with linked citations) plus,
// on the verse-finder path, the reasoning trail.
export function AiAnswer({
  q,
  translation,
}: {
  q: string;
  translation?: string;
}) {
  const [raw, setRaw] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  // Guard against out-of-order responses when the query changes mid-stream.
  const runId = useRef(0);
  // Bumped by the "Find the verse" button to re-fire the request with deepen.
  const [rerun, setRerun] = useState(0);
  const deepenRef = useRef(false);
  // A long answer is capped and fades out behind a "Show more" toggle.
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const trimmed = q.trim();
  // A bare reference ("John 3:16", "Psalm 23") is a navigation, not a question —
  // the reference card handles it; don't spend a generation on it.
  const isBareReference = parseReference(trimmed) != null;

  // Reset the manual deepen override whenever the query changes.
  useEffect(() => {
    deepenRef.current = false;
  }, [q]);

  useEffect(() => {
    if (!trimmed || isBareReference) {
      setStatus('idle');
      setRaw('');
      return;
    }
    const id = ++runId.current;
    const controller = new AbortController();
    setStatus('streaming');
    setRaw('');
    (async () => {
      try {
        const res = await fetch('/api/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: trimmed,
            translation,
            deepen: deepenRef.current,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          if (id === runId.current) setStatus('error');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          if (id === runId.current) setRaw(acc);
        }
        if (id === runId.current) setStatus('done');
      } catch {
        if (id === runId.current && !controller.signal.aborted) {
          setStatus('error');
        }
      }
    })();
    return () => controller.abort();
  }, [trimmed, translation, isBareReference, rerun]);

  const { answer, reasoning } = parseStream(raw);

  // Measure whether the answer overflows the collapsed height; re-run as it
  // streams (scrollHeight is the full height even while the box is clipped).
  useEffect(() => {
    const el = contentRef.current;
    setOverflowing(el ? el.scrollHeight > COLLAPSED_HEIGHT + 24 : false);
  }, [answer]);

  if (!trimmed || isBareReference || status === 'idle') return null;
  // A done-but-empty stream means a truncated/disabled response — hide the shell
  // (but keep it if a dig produced reasoning worth showing).
  if (status === 'done' && !answer && !reasoning) return null;

  const paragraphs = answer.split(/\n{2,}/).filter((p) => p.trim());
  const collapsed = overflowing && !expanded;
  // Offer a manual "find the verse" dig only once a cheap answer settled without
  // one (no reasoning) — it re-fires forcing the verse-finder loop.
  const canDeepen = status === 'done' && !reasoning && Boolean(answer);

  return (
    <section
      aria-label="AI answer"
      className="border-gold-soft/40 bg-paper-raised rounded-2xl border px-5 py-4"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-gold text-[15px]">
          ✦
        </span>
        <span className="text-gold-soft text-[11px] font-bold tracking-[0.14em] uppercase">
          AI answer
        </span>
        <span className="border-line-strong bg-paper text-faint rounded-full border px-[9px] py-[2px] text-[10.5px] font-semibold tracking-[0.08em] uppercase">
          Beta
        </span>
      </div>

      <ReasoningTrail
        reasoning={reasoning}
        answerPresent={Boolean(answer)}
        isStreaming={status === 'streaming'}
      />

      {status === 'error' ? (
        <p className="text-muted mt-2 text-[14px] leading-relaxed">
          Sorry — we couldn't generate an answer for this query.
        </p>
      ) : answer ? (
        <>
          <div
            ref={contentRef}
            className={
              collapsed
                ? 'lb-answer-in text-ink mt-2 space-y-3 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)] text-[15px] leading-relaxed [-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent)]'
                : 'lb-answer-in text-ink mt-2 space-y-3 text-[15px] leading-relaxed'
            }
            style={collapsed ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
          >
            {paragraphs.map((p, i) => (
              <p key={i}>{renderParagraph(p, trimmed, translation)}</p>
            ))}
          </div>
          {overflowing ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-gold-soft hover:text-gold mt-1.5 text-[12px] font-medium transition-colors"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </>
      ) : reasoning ? null : (
        <p className="text-muted mt-2 text-[14px] leading-relaxed">Seeking…</p>
      )}

      {canDeepen ? (
        <button
          type="button"
          onClick={() => {
            deepenRef.current = true;
            setRerun((n) => n + 1);
          }}
          className="text-gold-soft hover:text-gold mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors"
        >
          <SearchGlyph size={12} />
          Find the verse — search by meaning
        </button>
      ) : null}

      {status !== 'error' && (
        <p className="text-faint mt-3 text-[11px] leading-relaxed">
          Generated by AI. Please verify against Scripture.
        </p>
      )}
    </section>
  );
}
