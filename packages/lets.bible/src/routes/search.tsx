import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { AiAnswer } from '@/components/ai-answer';
import { PageShell } from '@/components/chrome';
import { LiveSearchBox } from '@/components/live-search-box';
import { chapterLink } from '@/lib/reference';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/search')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; translation?: string } => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    translation:
      typeof search.translation === 'string' ? search.translation : undefined,
  }),
  component: SearchResults,
});

function SearchResults() {
  const { q, translation } = Route.useSearch();
  const trpc = useTRPC();
  const { data, isLoading, isError } = useQuery({
    ...trpc.bible.search.queryOptions({ q: q ?? '', translation }),
    enabled: !!q?.trim(),
  });

  return (
    <PageShell>
      <div className="mx-auto max-w-[680px] px-6 pt-12 pb-20">
        <LiveSearchBox size="md" initialQuery={q ?? ''} />

        <div className="mt-10">
          {!q?.trim() ? (
            <p className="text-faint text-[14px]">
              Search a reference, phrase, topic, or idea.
            </p>
          ) : isLoading ? (
            <p className="text-faint text-[14px]">Searching…</p>
          ) : isError ? (
            <p className="text-redletter text-[14px]">
              Something went wrong. Please try again.
            </p>
          ) : (
            <Results query={q} translation={translation} data={data} />
          )}
        </div>
      </div>
    </PageShell>
  );
}

type VerseHit = {
  ref: string;
  slug: string;
  name: string;
  chapter: number;
  verse: number;
  text: string;
  highlight: string;
};

type SearchData = {
  reference: {
    book: string;
    chapter: number;
    verse?: number;
    label: string;
  } | null;
  verses: VerseHit[];
  related: VerseHit[];
  crossReferences: Array<{
    label: string;
    slug: string;
    chapter: number;
    verse: number | null;
    text: string | null;
  }>;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-faint mb-3 text-[11px] font-bold tracking-[0.1em] uppercase">
      {children}
    </div>
  );
}

function VerseRow({ hit, html }: { hit: VerseHit; html?: boolean }) {
  return (
    <li>
      <Link
        to="/bible/$book/$chapter"
        params={{ book: hit.slug, chapter: String(hit.chapter) }}
        search={{ v: hit.verse }}
        // Verse deep-link: don't reset scroll to top — the reader scrolls the
        // verse into view (see chapterLink in lib/reference.ts).
        resetScroll={false}
        className="hover:bg-paper-soft block rounded-xl px-4 py-3 transition"
      >
        <span className="text-gold text-[13px] font-semibold">
          {hit.name} {hit.chapter}:{hit.verse}
        </span>
        {html ? (
          // ES highlight uses encoder:'html' — the verse text is HTML-escaped and
          // only our <mark> tags are injected, so this is safe to render.
          <span
            className="search-result text-ink mt-1 block font-serif text-[16px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: hit.highlight }}
          />
        ) : (
          <span className="text-ink mt-1 block font-serif text-[16px] leading-relaxed">
            {hit.text}
          </span>
        )}
      </Link>
    </li>
  );
}

function Results({
  query,
  translation,
  data,
}: {
  query: string;
  translation?: string;
  data: SearchData | undefined;
}) {
  if (!data) {
    return null;
  }
  const { reference, verses, related, crossReferences } = data;
  const empty =
    !reference &&
    verses.length === 0 &&
    related.length === 0 &&
    crossReferences.length === 0;

  if (empty) {
    return (
      <p className="text-faint text-[14px]">
        No results for “{query}”. Try different words or a reference like “John
        3:16”.
      </p>
    );
  }

  return (
    <div className="space-y-9">
      <AiAnswer q={query} translation={translation} />

      {reference ? (
        <Link
          {...chapterLink(reference.book, reference.chapter, reference.verse)}
          className="border-gold-soft/50 bg-paper-raised hover:border-gold-soft flex items-center justify-between rounded-2xl border px-5 py-4 shadow-sm transition"
        >
          <span>
            <span className="text-gold-soft block text-[11px] font-bold tracking-[0.14em] uppercase">
              Go to reference
            </span>
            <span className="text-ink-strong mt-0.5 block font-serif text-[20px]">
              {reference.label}
            </span>
          </span>
          <span className="text-gold text-[18px]">→</span>
        </Link>
      ) : null}

      {crossReferences.length > 0 ? (
        <section>
          <SectionLabel>Cross-references</SectionLabel>
          <ul className="space-y-1">
            {crossReferences.map((x) => (
              <li key={x.label}>
                <Link
                  {...chapterLink(x.slug, x.chapter, x.verse ?? undefined)}
                  className="hover:bg-paper-soft block rounded-xl px-4 py-3 transition"
                >
                  <span className="text-gold text-[13px] font-semibold">
                    {x.label}
                  </span>
                  {x.text ? (
                    <span className="text-ink mt-1 block font-serif text-[16px] leading-relaxed">
                      {x.text}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {verses.length > 0 ? (
        <section>
          <SectionLabel>
            {verses.length} {verses.length === 1 ? 'verse' : 'verses'}
          </SectionLabel>
          <ul className="space-y-1">
            {verses.map((v) => (
              <VerseRow key={v.ref} hit={v} html />
            ))}
          </ul>
        </section>
      ) : null}

      {related.length > 0 ? (
        <section>
          <SectionLabel>Related passages</SectionLabel>
          <ul className="space-y-1">
            {related.map((v) => (
              <VerseRow key={v.ref} hit={v} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
