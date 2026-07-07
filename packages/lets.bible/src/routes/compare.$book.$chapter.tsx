import { Menu } from '@base-ui/react/menu';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { z } from 'zod';

import { bookBySlug } from '@/lib/canon';
import { adjacentChapter, chapterLink } from '@/lib/reference';
import { useTRPC } from '@/trpc/react';

const searchSchema = z.object({
  // Comma-separated translation ids, e.g. ?with=BSB,MSB
  with: z.string().optional().catch(undefined),
  v: z.coerce.number().int().positive().optional().catch(undefined),
});

export const Route = createFileRoute('/compare/$book/$chapter')({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({ with: search.with }),
  loader: async ({ context: { queryClient, trpc }, params, deps }) => {
    const book = bookBySlug(params.book);
    const chapter = Number(params.chapter);
    if (
      !book ||
      !Number.isInteger(chapter) ||
      chapter < 1 ||
      chapter > book.chapterCount
    ) {
      throw notFound();
    }
    const translations = await queryClient.ensureQueryData(
      trpc.bible.translations.queryOptions(),
    );
    const ids = resolveWith(deps.with, translations);
    await queryClient.ensureQueryData(
      trpc.bible.compareChapter.queryOptions({
        book: params.book,
        chapter,
        translations: ids,
      }),
    );
  },
  component: Compare,
});

// The translation ids to compare: the `?with=` list (filtered to real ones), or
// all available translations by default.
function resolveWith(
  withParam: string | undefined,
  translations: Array<{ id: string }>,
): string[] {
  const all = translations.map((t) => t.id);
  if (!withParam) {
    return all;
  }
  const requested = withParam.split(',').filter(Boolean);
  const valid = requested.filter((id) => all.includes(id));
  return valid.length > 0 ? valid : all;
}

// Normalize a surface word for cross-translation comparison: lowercase, drop
// surrounding punctuation. Empty when the chunk is pure punctuation.
function normWord(w: string): string {
  return w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

type Segment = { text: string; diff: boolean };

// For each translation's text of a verse, split it into segments marking which
// runs DIFFER across the translations — a word is "shared" only if it appears in
// every translation's version of the verse; anything else is a difference. This
// is what gets highlighted, so the eye lands on where the translations diverge
// (e.g. "be anxious" vs "be careful for"). With <2 texts there's nothing to
// compare, so nothing is highlighted.
function diffSegments(texts: Array<string | null>): Array<Segment[] | null> {
  const present = texts.filter((t): t is string => t != null);
  if (present.length < 2) {
    return texts.map((t) => (t == null ? null : [{ text: t, diff: false }]));
  }

  const wordSets = present.map((t) => {
    const set = new Set<string>();
    for (const w of t.split(/\s+/)) {
      const n = normWord(w);
      if (n) {
        set.add(n);
      }
    }
    return set;
  });
  const shared = new Set<string>();
  for (const w of wordSets[0]) {
    if (wordSets.every((s) => s.has(w))) {
      shared.add(w);
    }
  }
  const isDiff = (chunk: string) => {
    const n = normWord(chunk);
    return n.length > 0 && !shared.has(n);
  };

  return texts.map((t) => {
    if (t == null) {
      return null;
    }
    // Word chunks and whitespace chunks, in order, so we can rebuild exactly.
    const chunks = t.match(/\S+|\s+/g) ?? [];
    const segs: Segment[] = [];
    const pushPlain = (s: string) => {
      const last = segs[segs.length - 1];
      if (last && !last.diff) {
        last.text += s;
      } else {
        segs.push({ text: s, diff: false });
      }
    };
    let i = 0;
    while (i < chunks.length) {
      const c = chunks[i];
      if (/^\s/.test(c)) {
        pushPlain(c);
        i++;
        continue;
      }
      if (!isDiff(c)) {
        pushPlain(c);
        i++;
        continue;
      }
      // Greedily extend the diff run across "<space><diff word>" so adjacent
      // differing words highlight as one contiguous phrase.
      let run = c;
      i++;
      while (
        i + 1 < chunks.length &&
        /^\s/.test(chunks[i]) &&
        isDiff(chunks[i + 1])
      ) {
        run += chunks[i] + chunks[i + 1];
        i += 2;
      }
      segs.push({ text: run, diff: true });
    }
    return segs;
  });
}

function VerseText({ segments }: { segments: Segment[] | null }) {
  if (segments == null) {
    return <span className="text-faint italic">—</span>;
  }
  return (
    <>
      {segments.map((seg, i) =>
        seg.diff ? (
          <mark
            key={i}
            className="text-ink-strong rounded-[3px] bg-[rgba(154,123,63,0.18)] box-decoration-clone px-[2px]"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function Compare() {
  const { book: bookSlug, chapter: chapterStr } = Route.useParams();
  const { with: withParam, v } = Route.useSearch();
  const trpc = useTRPC();
  const chapterNum = Number(chapterStr);

  // Scroll the target verse (from ?v=) into view once.
  useEffect(() => {
    if (v == null) {
      return;
    }
    document
      .querySelector(`[data-compare-verse="${v}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [v]);

  const { data: translations } = useSuspenseQuery(
    trpc.bible.translations.queryOptions(),
  );
  const ids = resolveWith(withParam, translations);
  const { data } = useSuspenseQuery(
    trpc.bible.compareChapter.queryOptions({
      book: bookSlug,
      chapter: chapterNum,
      translations: ids,
    }),
  );

  const book = bookBySlug(bookSlug);
  if (!book) {
    return null;
  }

  const cols = data.translations.length;
  // verse-number gutter + one column per translation. No column gap so the
  // vertical dividers (border-l on each translation cell) run continuously.
  const gridTemplate = `var(--gutter) repeat(${cols}, minmax(0, 1fr))`;

  const shownIds = new Set(data.translations.map((t) => t.id));
  const addable = translations.filter((t) => !shownIds.has(t.id));

  const firstVerse = data.verses[0]?.verse;
  const lastVerse = data.verses[data.verses.length - 1]?.verse;
  const range =
    firstVerse == null
      ? `${book.name} ${chapterNum}`
      : firstVerse === lastVerse
        ? `${book.name} ${chapterNum}:${firstVerse}`
        : `${book.name} ${chapterNum}:${firstVerse}–${lastVerse}`;

  return (
    <div className="bg-paper flex min-h-screen flex-col [--gutter:38px] sm:[--gutter:56px]">
      {/* sticky header + column labels (full width) */}
      <div className="border-line bg-paper-soft/95 sticky top-0 z-30 border-b backdrop-blur-sm">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 sm:px-6">
          <Link
            {...chapterLink(bookSlug, chapterNum)}
            title="Back to reading"
            className="text-muted hover:text-ink inline-flex items-center gap-[7px] justify-self-start text-[13.5px] font-semibold"
          >
            <span className="text-[15px]">←</span>
            <span className="truncate">
              {book.name} {chapterNum}
            </span>
          </Link>
          <div className="justify-self-center text-center">
            <span className="text-ink-strong font-serif text-[18px] font-bold sm:text-[19px]">
              Compare
            </span>
            <span className="text-muted-2 ml-2 hidden text-[13.5px] sm:inline">
              {range}
            </span>
          </div>
          <div className="justify-self-end">
            <AddTranslation
              addable={addable}
              shown={data.translations.map((t) => t.id)}
              book={bookSlug}
              chapter={chapterNum}
            />
          </div>
        </header>

        {/* column header row */}
        <div
          className="border-line/70 grid border-t"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span />
          {data.translations.map((t) => (
            <div
              key={t.id}
              className="border-line/70 border-l px-4 py-2.5 sm:px-6"
            >
              <div className="text-ink-strong text-[13px] font-bold tracking-[0.03em]">
                {t.id}
              </div>
              <div className="text-muted-2 truncate text-[11.5px]">
                {t.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* verse rows (full width) */}
      <div className="flex-1">
        {data.verses.map((row, ri) => {
          const segments = diffSegments(row.texts);
          const targeted = row.verse === v;
          return (
            <div
              key={row.verse}
              data-compare-verse={row.verse}
              className={`border-line/55 grid border-b ${
                targeted
                  ? 'bg-[rgba(154,123,63,0.1)]'
                  : ri % 2 === 1
                    ? 'bg-paper-soft/55'
                    : ''
              }`}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="text-gold-soft pt-4 pr-2 text-right font-sans text-[11px] font-semibold select-none sm:pt-5">
                {row.verse}
              </div>
              {row.texts.map((_text, i) => (
                <p
                  key={data.translations[i].id}
                  className="border-line/55 text-ink border-l px-4 py-4 font-serif text-[15px] leading-[1.62] sm:px-6 sm:py-5 sm:text-[16.5px] sm:leading-[1.7]"
                >
                  <VerseText segments={segments[i]} />
                </p>
              ))}
            </div>
          );
        })}

        {/* chapter nav */}
        <div className="flex items-center justify-between px-4 py-6 text-[12.5px] sm:px-6">
          <CompareNav
            slug={bookSlug}
            chapter={chapterNum}
            withParam={withParam}
          />
        </div>
      </div>
    </div>
  );
}

function AddTranslation({
  addable,
  shown,
  book,
  chapter,
}: {
  addable: Array<{ id: string; name: string }>;
  shown: string[];
  book: string;
  chapter: number;
}) {
  const navigate = useNavigate();

  // Nothing left to add (every translation is already shown) → render nothing
  // rather than an inert "+ Add translation" that looks clickable but does
  // nothing.
  if (addable.length === 0) {
    return null;
  }

  const add = (id: string) => {
    navigate({
      to: '/compare/$book/$chapter',
      params: { book, chapter: String(chapter) },
      search: (prev) => ({ ...prev, with: [...shown, id].join(',') }),
    });
  };

  return (
    <Menu.Root>
      <Menu.Trigger className="text-gold hover:bg-paper focus-visible:ring-gold/40 data-[popup-open]:bg-paper inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[13.5px] font-semibold outline-none focus-visible:ring-2">
        + Add translation
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end">
          <Menu.Popup className="border-line-strong bg-paper-raised z-40 rounded-xl border p-1 shadow-[0_26px_50px_-28px_rgba(40,34,18,0.45)]">
            {addable.map((t) => (
              <Menu.Item
                key={t.id}
                onClick={() => add(t.id)}
                className="data-highlighted:bg-paper-soft flex cursor-pointer items-baseline gap-2 rounded-md px-3 py-1.5 outline-none"
              >
                <span className="text-ink-strong text-[13px] font-bold">
                  {t.id}
                </span>
                <span className="text-muted-2 text-[12px]">{t.name}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function CompareNav({
  slug,
  chapter,
  withParam,
}: {
  slug: string;
  chapter: number;
  withParam: string | undefined;
}) {
  const prev = adjacentChapter(slug, chapter, -1);
  const next = adjacentChapter(slug, chapter, 1);
  const search = withParam ? { with: withParam } : {};
  return (
    <>
      {prev ? (
        <Link
          to="/compare/$book/$chapter"
          params={{ book: prev.book.slug, chapter: String(prev.chapter) }}
          search={search}
          className="text-muted-2 hover:text-gold"
        >
          ‹ {prev.book.name} {prev.chapter}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          to="/compare/$book/$chapter"
          params={{ book: next.book.slug, chapter: String(next.chapter) }}
          search={search}
          className="text-gold font-semibold"
        >
          {next.book.name} {next.chapter} ›
        </Link>
      ) : (
        <span />
      )}
    </>
  );
}
