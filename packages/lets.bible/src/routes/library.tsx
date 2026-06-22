import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageShell } from '@/components/chrome';
import { highlightDotStyle } from '@/lib/highlight-colors';
import { chapterLink } from '@/lib/reference';
import { useAllHighlights, useAllNotes, useRecent } from '@/local/store';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/library')({
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.common.hasValidSession.queryOptions(),
    );
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

        {empty ? (
          <p className="mt-8 text-[14px] text-faint">
            Highlight a verse or add a note in the reader and it’ll show up
            here.
          </p>
        ) : (
          <div className="mt-7 space-y-9">
            <section>
              <SectionLabel>Highlights</SectionLabel>
              {highlights.length === 0 ? (
                <p className="border-line border-t py-4 text-[13.5px] text-faint">
                  Select a verse in the reader and pick a color to highlight it.
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
          </div>
        )}
      </div>
    </PageShell>
  );
}
