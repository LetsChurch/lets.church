import { Autocomplete } from '@base-ui-components/react/autocomplete';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { EmptyState } from '@/components/empty-state';
import { SearchRow } from '@/components/search-row';
import SearchTabs from '@/components/search-tabs';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { formatTime } from '@/util/format';

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type SearchResultItem = {
  id: string;
  title: string | null;
  description: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  lengthSeconds: number | null;
  thumbnailUrl: string | null;
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarPath: string | null;
    defaultThumbnailPath: string | null;
    avatarUrl: string | null;
  };
  _count: {
    uploadViews: number;
  };
  segments?: TranscriptSegment[];
};

export const Route = createFileRoute('/embed/channel/$slug')({
  component: RouteComponent,
  validateSearch: z.object({
    q: z.string().optional(),
    focus: z.enum(['media', 'transcripts']).catch('media'),
    sort: z.enum(['relevance', 'date-asc', 'date-desc']).optional(),
    dateRange: z
      .enum(['all-time', 'today', 'this-week', 'this-month', 'this-year'])
      .optional(),
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
    focus: search.focus,
    sort: search.sort,
    dateRange: search.dateRange,
  }),
  loader: async ({ context, params, deps }) => {
    const { slug } = params;

    // Ensure channel exists
    const channelPromise = context.queryClient.ensureQueryData(
      context.trpc.channel.getChannelBySlug.queryOptions({ slug }),
    );

    if (deps.q) {
      // Prefetch search results
      const searchPromise = context.queryClient.prefetchInfiniteQuery(
        context.trpc.search.performSearch.infiniteQueryOptions({
          q: deps.q,
          focus: deps.focus as 'media' | 'transcripts',
          channelSlugs: [slug],
          limit: 20,
          sort: deps.sort,
          dateRange: deps.dateRange,
        }),
      );
      await Promise.all([channelPromise, searchPromise]);
    } else {
      // Prefetch recent uploads
      const mediaPromise = context.queryClient.prefetchInfiniteQuery(
        context.trpc.channel.getChannelMedia.infiniteQueryOptions({
          slug,
          limit: 20,
        }),
      );
      await Promise.all([channelPromise, mediaPromise]);
    }

    return {};
  },
  head: ({ params }) => {
    const slug = params.slug;
    const title = `Channel: ${slug} - Let's Church`;
    const description = `Embed ${slug} channel content with search`;
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : `https://lets.church/embed/channel/${slug}`;

    return {
      meta: [
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        {
          property: 'og:url',
          content: url,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:title',
          content: title,
        },
        {
          property: 'og:description',
          content: description,
        },
      ],
      links: [
        {
          rel: 'canonical',
          href: `https://lets.church/embed/channel/${slug}`,
        },
      ],
    };
  },
});

function RouteComponent() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const trpc = useTRPC();

  const { data: channel } = useSuspenseQuery(
    trpc.channel.getChannelBySlug.queryOptions({ slug: params.slug }),
  );

  const hasQuery = search.q && search.q.trim().length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Search Bar */}
      <div className="sticky top-0 z-10 border-gray-200 border-b bg-white px-4 py-3">
        <EmbedSearchBar
          placeholder={`Search in ${channel.name}...`}
          defaultValue={search.q}
        />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4">
        {hasQuery && search.q ? (
          <SearchResults q={search.q} channelSlug={params.slug} />
        ) : (
          <RecentUploads channelSlug={params.slug} />
        )}
      </div>
    </div>
  );
}

function EmbedSearchBar({
  placeholder = 'Search...',
  defaultValue,
}: {
  placeholder?: string;
  defaultValue?: string;
}) {
  const [_query, setQuery] = useState(defaultValue || '');

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const searchQuery = formData.get('q') as string;

    if (searchQuery.trim()) {
      // Update URL with search params
      const url = new URL(window.location.href);
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('focus', 'media');
      window.history.pushState({}, '', url.toString());
      setQuery(searchQuery);
      // Trigger a re-render by dispatching a custom event
      window.dispatchEvent(new Event('popstate'));
    }
  };

  const handleClear = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    url.searchParams.delete('focus');
    url.searchParams.delete('sort');
    url.searchParams.delete('dateRange');
    window.history.pushState({}, '', url.toString());
    setQuery('');
    window.dispatchEvent(new Event('popstate'));
  };

  return (
    <Autocomplete.Root defaultValue={defaultValue} items={[]}>
      <form
        onSubmit={handleSubmit}
        className={cn(
          'flex h-10 items-center gap-1 rounded-3xl border px-3 transition-all duration-200',
          'focus-within:border-gray-950/20 focus-within:shadow-[0_0_0_2px_--theme(--color-gray-950/0.1)]',
          'border-gray-950/10 bg-gray-950/5',
        )}
      >
        <div className="min-w-0 flex-1 px-1 pb-0.5">
          <Autocomplete.Input
            name="q"
            placeholder={placeholder}
            className={cn(
              'w-full appearance-none font-medium text-gray-950 text-sm leading-none outline-none',
              'placeholder-gray-950/30',
            )}
          />
        </div>
        <div className="flex shrink-0 items-center gap-0">
          <Autocomplete.Clear
            onClick={handleClear}
            className="flex size-8 items-center justify-center rounded-full text-gray-950/50 transition-colors hover:bg-gray-950/10 hover:text-gray-950"
            aria-label="Clear search"
          >
            <IconX size={24} />
          </Autocomplete.Clear>
          <Autocomplete.Value>
            {(value) =>
              value ? null : (
                <button
                  type="submit"
                  className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-gray-950/10"
                >
                  <IconSearch size={24} className="text-gray-950 opacity-50" />
                </button>
              )
            }
          </Autocomplete.Value>
        </div>
      </form>
    </Autocomplete.Root>
  );
}

function RecentUploads({ channelSlug }: { channelSlug: string }) {
  const trpc = useTRPC();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data: mediaData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.channel.getChannelMedia.infiniteQueryOptions({
      slug: channelSlug,
      limit: 20,
    }),
    getNextPageParam: (lastPage) => {
      if (
        lastPage &&
        typeof lastPage === 'object' &&
        'nextCursor' in lastPage
      ) {
        return lastPage.nextCursor;
      }
      return null;
    },
    initialPageParam: null as string | null,
  });

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target?.isIntersecting) {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0,
      },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const mediaItems =
    mediaData?.pages.flatMap((page) => {
      if (page && typeof page === 'object' && 'items' in page) {
        return page.items;
      }
      return [];
    }) ?? [];

  const hasMedia = mediaItems.length > 0;

  // Add click handler to intercept internal links and open externally
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href^="/media/"]');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href) {
          window.open(
            `https://lets.church${href}`,
            '_blank',
            'noopener,noreferrer',
          );
        }
      }
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <>
      {hasMedia ? (
        <div className="space-y-4">
          {mediaItems.map((upload) => (
            <SearchRow
              key={upload.id}
              id={upload.id}
              title={upload.title ?? 'Untitled'}
              thumbnailUrl={upload.thumbnailUrl}
              channelName={upload.channel.name}
              channelImageUrl={upload.channel.avatarUrl}
              timestamp={
                upload.publishedAt
                  ? formatDistanceToNow(new Date(upload.publishedAt), {
                      addSuffix: true,
                    })
                  : undefined
              }
              duration={
                upload.lengthSeconds
                  ? formatTime(upload.lengthSeconds * 1000)
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          emptyTitle="No content yet"
          emptyBody="This channel hasn't uploaded any content yet."
          variant="error"
        />
      )}

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="h-20" />

      {/* Loading indicator */}
      {isFetchingNextPage ? (
        <div className="flex justify-center py-8">
          <div className="text-gray-600 text-sm">Loading more...</div>
        </div>
      ) : null}
    </>
  );
}

function SearchResults({ q, channelSlug }: { q: string; channelSlug: string }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const trpc = useTRPC();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data: searchData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...trpc.search.performSearch.infiniteQueryOptions({
      q,
      focus: search.focus,
      channelSlugs: [channelSlug],
      limit: 20,
      sort: search.sort,
      dateRange: search.dateRange,
    }),
    getNextPageParam: (lastPage) => {
      if (
        lastPage &&
        typeof lastPage === 'object' &&
        'nextCursor' in lastPage
      ) {
        return lastPage.nextCursor;
      }
      return null;
    },
    initialPageParam: 0,
  });

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target?.isIntersecting) {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0,
      },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Add click handler to intercept internal links and open externally
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href^="/media/"]');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href) {
          window.open(
            `https://lets.church${href}`,
            '_blank',
            'noopener,noreferrer',
          );
        }
      }
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, []);

  const firstPage = searchData?.pages[0];
  const mediaCount = firstPage?.mediaCount ?? 0;
  const transcriptCount = firstPage?.transcriptCount ?? 0;

  const items: SearchResultItem[] =
    searchData?.pages.flatMap((page) => {
      if (page && typeof page === 'object' && 'items' in page) {
        return page.items as SearchResultItem[];
      }
      return [];
    }) ?? [];

  const handleTabChange = (newFocus: 'media' | 'transcripts') => {
    navigate({
      search: (prev) => ({ ...prev, focus: newFocus }),
    });
  };

  return (
    <div className="space-y-6">
      <SearchTabs
        activeTab={search.focus === 'transcripts' ? 'transcripts' : 'media'}
        mediaCount={mediaCount}
        transcriptCount={transcriptCount}
        onTabChange={handleTabChange}
        className="border-gray-200"
      />

      {items.length > 0 ? (
        <div className="space-y-4">
          {items.map((item) => (
            <Result key={item.id} item={item} focus={search.focus} />
          ))}
        </div>
      ) : (
        <EmptyState
          emptyTitle="No matches found"
          emptyBody="Try rephrasing your search query"
          variant="error"
        />
      )}

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="h-20" />

      {/* Loading indicator */}
      {isFetchingNextPage ? (
        <div className="flex justify-center py-8">
          <div className="text-gray-600 text-sm">Loading more...</div>
        </div>
      ) : null}
    </div>
  );
}

function Result({
  item,
  focus,
}: {
  item: SearchResultItem;
  focus: 'media' | 'transcripts' | undefined;
}) {
  const [showAllSegments, setShowAllSegments] = useState(false);
  const segments = item.segments ?? [];
  const hasMultipleSegments = segments.length > 1;
  const displayedSegments = showAllSegments ? segments : segments.slice(0, 1);

  return (
    <SearchRow
      id={item.id}
      title={item.title ?? 'Untitled'}
      thumbnailUrl={item.thumbnailUrl}
      channelName={item.channel.name}
      channelImageUrl={item.channel.avatarUrl}
      timestamp={
        item.publishedAt
          ? formatDistanceToNow(new Date(item.publishedAt), {
              addSuffix: true,
            })
          : undefined
      }
      duration={
        item.lengthSeconds ? formatTime(item.lengthSeconds * 1000) : undefined
      }
    >
      {focus === 'transcripts' && segments.length > 0 ? (
        <div className="mt-2 space-y-2">
          {displayedSegments.map((segment, index) => (
            <a
              // biome-ignore lint/suspicious/noArrayIndexKey: index is stable here
              key={index}
              href={`https://lets.church/media/${item.id}#t=${segment.start / 1000}`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 flex cursor-pointer flex-row gap-1.5 rounded-md bg-gray-950/5 p-3 text-gray-950 transition-colors hover:bg-gray-950/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pt-1 font-mono text-[10px] leading-[1.4] tracking-[-0.2px]">
                {formatTime(segment.start)}
              </div>
              <div
                className="[&_mark]:-my-0.5 [&_mark]:-mx-1 text-gray-950/80 text-sm [&_mark]:rounded-sm [&_mark]:bg-orange-400/40 [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:text-gray-950"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped ElasticSearch output
                dangerouslySetInnerHTML={{
                  __html: segment.text,
                }}
              />
            </a>
          ))}
          {hasMultipleSegments ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowAllSegments((show) => !show);
              }}
              className="relative z-10 w-full px-1 py-0.5 text-center text-gray-600 text-xs opacity-0 transition-all hover:text-gray-950 group-hover:opacity-100"
            >
              {showAllSegments
                ? 'Show less'
                : `Show ${segments.length - 1} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </SearchRow>
  );
}
