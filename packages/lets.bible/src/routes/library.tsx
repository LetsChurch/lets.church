import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageShell } from '@/components/chrome';
import { highlightDotStyle } from '@/lib/highlight-colors';
import { chapterLink } from '@/lib/reference';
import {
  downloadWork,
  removeWork,
  useOfflineCommentaries,
} from '@/local/offline-commentaries';
import { useAllHighlights, useAllNotes, useRecent } from '@/local/store';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/library')({
  loader: async ({ context: { queryClient, trpc } }) => {
    await Promise.all([
      queryClient.ensureQueryData(trpc.common.hasValidSession.queryOptions()),
      queryClient.ensureQueryData(
        trpc.bible.commentaryWorksWithSize.queryOptions(),
      ),
    ]);
  },
  component: Library,
});

function relativeDay(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return `${Math.floor(days / 7)} weeks ago`;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-1.5 font-bold text-[11px] text-faint uppercase tracking-[0.1em]">
      {children}
    </div>
  );
}

// Per-commentator offline download/manage. Sizes come from the server
// (commentaryWorksWithSize); download state from the on-device store. Shown for
// everyone (incl. signed-out guests) — commentaries are public.
function OfflineCommentaries() {
  const trpc = useTRPC();
  const { data: works } = useSuspenseQuery(
    trpc.bible.commentaryWorksWithSize.queryOptions(),
  );
  const statuses = useOfflineCommentaries();
  if (works.length === 0) return null;
  return (
    <section>
      <SectionLabel>Offline commentaries</SectionLabel>
      <p className="mb-1.5 text-[12.5px] text-faint">
        Download a commentator to read it in the study panel without a
        connection.
      </p>
      {works.map((w) => {
        const status = statuses[w.id] ?? { state: 'idle' as const };
        const mb = (w.bytes / 1_000_000).toFixed(1);
        return (
          <div
            key={w.id}
            className="flex items-center gap-3 border-line border-t py-[14px]"
          >
            <div className="min-w-0">
              <div className="font-bold font-serif text-[16px] text-ink-strong">
                {w.name}
              </div>
              <div className="text-[12px] text-faint">
                {w.author} · {mb} MB
              </div>
            </div>
            <div className="ml-auto flex-shrink-0">
              {status.state === 'downloaded' ? (
                <button
                  type="button"
                  onClick={() => void removeWork(w.id)}
                  className="rounded-lg px-3 py-1.5 font-semibold text-[12.5px] text-redletter hover:bg-paper-soft"
                >
                  Remove
                </button>
              ) : status.state === 'downloading' ? (
                <span className="font-semibold text-[12.5px] text-muted-2 tabular-nums">
                  {Math.round((status.progress ?? 0) * 100)}%
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void downloadWork(w.id)}
                  className="rounded-lg border border-gold-soft/50 px-3 py-1.5 font-semibold text-[12.5px] text-gold hover:bg-gold/5"
                >
                  Download
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Library() {
  const trpc = useTRPC();
  const { data: signedIn } = useSuspenseQuery(
    trpc.common.hasValidSession.queryOptions(),
  );
  // Local-first: highlights/notes/history come from the on-device store, so the
  // Library works offline and even for signed-out (anonymous) visitors.
  const highlights = useAllHighlights();
  const notes = useAllNotes();
  const history = useRecent(20);

  const empty =
    highlights.length === 0 && notes.length === 0 && history.length === 0;

  return (
    <PageShell>
      <div className="mx-auto max-w-[760px] animate-fade px-6 pt-[34px] pb-16">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-[30px] text-ink-strong">Library</h1>
          <span className="text-[13px] text-muted-2">
            {highlights.length} highlights · {notes.length} notes
          </span>
        </div>

        {!signedIn ? (
          <p className="mt-4 rounded-xl border border-line bg-paper-soft px-4 py-3 text-[13px] text-muted">
            You’re reading as a guest — your library is saved on this device.{' '}
            <Link to="/login" className="font-semibold text-gold">
              Sign in
            </Link>{' '}
            to sync it across devices.
          </p>
        ) : null}

        <div className="mt-7 space-y-9">
          {empty ? (
            <p className="text-[14px] text-faint">
              Highlight a verse or add a note in the reader and it’ll show up
              here.
            </p>
          ) : (
            <>
              <section>
                <SectionLabel>Highlights</SectionLabel>
                {highlights.length === 0 ? (
                  <p className="border-line border-t py-4 text-[13.5px] text-faint">
                    Select a verse in the reader and pick a color to highlight
                    it.
                  </p>
                ) : (
                  highlights.map((h) => (
                    <Link
                      key={h.ref}
                      {...chapterLink(h.slug, h.chapter, h.verse)}
                      className="flex items-center gap-[13px] border-line border-t py-[14px] transition-colors hover:bg-paper-soft"
                    >
                      <span
                        className="size-2.5 flex-shrink-0 rounded-full"
                        style={highlightDotStyle(h.color)}
                      />
                      <span className="font-bold font-serif text-[16px] text-ink-strong">
                        {h.name} {h.chapter}:{h.verse}
                      </span>
                      <span className="ml-auto text-[12px] text-faint">
                        {relativeDay(h.updatedAt)}
                      </span>
                    </Link>
                  ))
                )}
              </section>

              <section>
                <SectionLabel>Notes</SectionLabel>
                {notes.length === 0 ? (
                  <p className="border-line border-t py-4 text-[13.5px] text-faint">
                    Add a note to any verse from the reader toolbar.
                  </p>
                ) : (
                  notes.map((n) => (
                    <Link
                      key={n.ref}
                      {...chapterLink(n.slug, n.chapter, n.verse)}
                      className="block border-line border-t py-[15px] transition-colors hover:bg-paper-soft"
                    >
                      <div className="flex items-baseline gap-2.5">
                        <span className="font-bold font-serif text-[16px] text-ink-strong">
                          {n.name} {n.chapter}:{n.verse}
                        </span>
                        <span className="text-[12px] text-faint">
                          {relativeDay(n.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[14.5px] text-ink leading-relaxed">
                        {n.body}
                      </p>
                    </Link>
                  ))
                )}
              </section>

              <section>
                <SectionLabel>History</SectionLabel>
                {history.length === 0 ? (
                  <p className="border-line border-t py-4 text-[13.5px] text-faint">
                    Chapters you read will appear here.
                  </p>
                ) : (
                  history.map((r) => (
                    <Link
                      key={`${r.slug}-${r.chapter}`}
                      to="/bible/$book/$chapter"
                      params={{ book: r.slug, chapter: String(r.chapter) }}
                      search={r.verse != null ? { v: r.verse } : {}}
                      className="flex items-center justify-between border-line border-t py-3 hover:text-gold"
                    >
                      <span className="font-serif text-[16px] text-ink-strong">
                        {r.name} {r.chapter}
                      </span>
                      <span className="text-[12px] text-faint-2">
                        {relativeDay(r.updatedAt)}
                      </span>
                    </Link>
                  ))
                )}
              </section>
            </>
          )}

          <OfflineCommentaries />
        </div>
      </div>
    </PageShell>
  );
}
