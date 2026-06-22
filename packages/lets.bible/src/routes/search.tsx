import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageShell } from '@/components/chrome';
import { LiveSearchBox } from '@/components/live-search-box';
import { chapterLink } from '@/lib/reference';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === 'string' ? { q: search.q } : {},
  component: SearchResults,
});

function SearchResults() {
  const { q } = Route.useSearch();
  const trpc = useTRPC();
  const { data, isLoading, isError } = useQuery({
    ...trpc.bible.search.queryOptions({ q: q ?? '' }),
    enabled: !!q?.trim(),
  });

  return (
    <PageShell>
      <div className="mx-auto max-w-[680px] px-6 pt-12 pb-20">
        <LiveSearchBox size="md" />

        <div className="mt-10">
          {!q?.trim() ? (
            <p className="text-[14px] text-faint">
              Search a reference, phrase, topic, or idea.
            </p>
          ) : isLoading ? (
            <p className="text-[14px] text-faint">Searching…</p>
          ) : isError ? (
            <p className="text-[14px] text-redletter">
              Something went wrong. Please try again.
            </p>
          ) : (
            <Results query={q} data={data} />
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
    <div className="mb-3 font-bold text-[11px] text-faint uppercase tracking-[0.1em]">
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
        className="block rounded-xl px-4 py-3 transition hover:bg-paper-soft"
      >
        <span className="font-semibold text-[13px] text-gold">
          {hit.name} {hit.chapter}:{hit.verse}
        </span>
        {html ? (
          // ES highlight uses encoder:'html' — the verse text is HTML-escaped and
          // only our <mark> tags are injected, so this is safe to render.
          <span
            className="search-result mt-1 block font-serif text-[16px] text-ink leading-relaxed"
            dangerouslySetInnerHTML={{ __html: hit.highlight }}
          />
        ) : (
          <span className="mt-1 block font-serif text-[16px] text-ink leading-relaxed">
            {hit.text}
          </span>
        )}
      </Link>
    </li>
  );
}

function Results({
  query,
  data,
}: {
  query: string;
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
      <p className="text-[14px] text-faint">
        No results for “{query}”. Try different words or a reference like “John
        3:16”.
      </p>
    );
  }

  return (
    <div className="space-y-9">
      {reference ? (
        <Link
          {...chapterLink(reference.book, reference.chapter, reference.verse)}
          className="flex items-center justify-between rounded-2xl border border-gold-soft/50 bg-paper-raised px-5 py-4 shadow-sm transition hover:border-gold-soft"
        >
          <span>
            <span className="block font-bold text-[11px] text-gold-soft uppercase tracking-[0.14em]">
              Go to reference
            </span>
            <span className="mt-0.5 block font-serif text-[20px] text-ink-strong">
              {reference.label}
            </span>
          </span>
          <span className="text-[18px] text-gold">→</span>
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
                  className="block rounded-xl px-4 py-3 transition hover:bg-paper-soft"
                >
                  <span className="font-semibold text-[13px] text-gold">
                    {x.label}
                  </span>
                  {x.text ? (
                    <span className="mt-1 block font-serif text-[16px] text-ink leading-relaxed">
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
