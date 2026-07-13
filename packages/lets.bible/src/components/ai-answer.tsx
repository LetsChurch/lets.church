import { Link } from '@tanstack/react-router';
import { Fragment, useEffect, useRef, useState } from 'react';

import { parseReference, passageLink } from '@/lib/reference';

type Status = 'idle' | 'streaming' | 'done' | 'error';

// Collapsed max height (px) before the "Show more" toggle. Answers taller than
// this fade out and expand on click, matching the lets.church answer card.
const COLLAPSED_HEIGHT = 220;

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

// Streaming, cited AI answer over Scripture. Fires for topical/question queries
// (skips bare references — those get the "go to reference" card). POSTs the
// query to /api/answer and renders the streamed text with linked citations.
export function AiAnswer({
  q,
  translation,
}: {
  q: string;
  translation?: string;
}) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  // Guard against out-of-order responses when the query changes mid-stream.
  const runId = useRef(0);
  // A long answer is capped and fades out behind a "Show more" toggle.
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const trimmed = q.trim();
  // A bare reference ("John 3:16", "Psalm 23") is a navigation, not a question —
  // the reference card handles it; don't spend a generation on it.
  const isBareReference = parseReference(trimmed) != null;

  useEffect(() => {
    if (!trimmed || isBareReference) {
      setStatus('idle');
      setText('');
      return;
    }
    const id = ++runId.current;
    const controller = new AbortController();
    setStatus('streaming');
    setText('');
    (async () => {
      try {
        const res = await fetch('/api/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: trimmed, translation }),
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
          if (id === runId.current) setText(acc);
        }
        if (id === runId.current) setStatus('done');
      } catch {
        if (id === runId.current && !controller.signal.aborted) {
          setStatus('error');
        }
      }
    })();
    return () => controller.abort();
  }, [trimmed, translation, isBareReference]);

  // Measure whether the answer overflows the collapsed height; re-run as it
  // streams (scrollHeight is the full height even while the box is clipped).
  useEffect(() => {
    const el = contentRef.current;
    setOverflowing(el ? el.scrollHeight > COLLAPSED_HEIGHT + 24 : false);
  }, [text]);

  if (!trimmed || isBareReference || status === 'idle') return null;
  // A done-but-empty stream means a truncated response — hide the empty shell.
  if (status === 'done' && !text) return null;

  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const collapsed = overflowing && !expanded;

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

      {status === 'error' ? (
        <p className="text-muted mt-2 text-[14px] leading-relaxed">
          Sorry — we couldn't generate an answer for this query.
        </p>
      ) : text ? (
        <>
          <div
            ref={contentRef}
            className={
              collapsed
                ? 'text-ink mt-2 space-y-3 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)] text-[15px] leading-relaxed [-webkit-mask-image:linear-gradient(to_bottom,black_60%,transparent)]'
                : 'text-ink mt-2 space-y-3 text-[15px] leading-relaxed'
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
      ) : (
        <p className="text-muted mt-2 text-[14px] leading-relaxed">Seeking…</p>
      )}

      {status !== 'error' && (
        <p className="text-faint mt-3 text-[11px] leading-relaxed">
          Generated by AI. Please verify against Scripture.
        </p>
      )}
    </section>
  );
}
