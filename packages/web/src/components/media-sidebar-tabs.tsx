import { Tabs } from '@base-ui/react/tabs';
import { useStore } from '@nanostores/react';
import {
  IconListNumbers,
  IconSearch,
  IconSparkles,
  IconTextCaption,
  IconX,
} from '@tabler/icons-react';
import { useMemo } from 'react';

import { PlaylistSidebar } from '@/components/playlist-sidebar';
import { Transcript } from '@/components/transcript';
import {
  type TranscriptParagraph,
  TranscriptParagraphs,
} from '@/components/transcript-paragraphs';
import { TranscriptSearchResults } from '@/components/transcript-search-results';
import {
  $isSearchActive,
  $searchQuery,
  $searchResults,
  performSearch,
  resetSearch,
  type TranscriptLine,
} from '@/stores/transcript-search';
import { askVideoQuestion } from '@/stores/video-ask';

type PlaylistItem = {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  lengthSeconds: number | null;
  publishedAt: Date | null;
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
  };
};

type MediaSidebarTabsProps = {
  transcript: Array<{ start: number; text: string }>;
  // When present, render the newer word-level paragraph transcript instead of
  // the legacy VTT lines (search is deferred in this mode).
  paragraphs?: Array<TranscriptParagraph> | null;
  isTranscriptProcessing: boolean;
  playlistContext?: {
    listId: string;
    listType: 'playlist' | 'series';
    listTitle?: string;
    items: PlaylistItem[];
    currentMediaId: string;
  };
};

export function MediaSidebarTabs({
  transcript,
  paragraphs,
  isTranscriptProcessing,
  playlistContext,
}: MediaSidebarTabsProps) {
  const useParagraphs = Boolean(paragraphs && paragraphs.length > 0);
  const hasPlaylist = Boolean(playlistContext);

  const isSearchActive = useStore($isSearchActive);
  const searchQuery = useStore($searchQuery);
  const searchResults = useStore($searchResults);

  // FlexSearch indexes one "line" at a time — feed paragraphs as
  // paragraph-sized "lines" when we're in paragraph mode (the search
  // store + results component expect milliseconds, so multiply seconds
  // by 1000 here). Falls back to the legacy VTT line array.
  const searchableLines = useMemo<TranscriptLine[]>(() => {
    if (useParagraphs && paragraphs) {
      return paragraphs.map((p, i) => ({
        id: i,
        start: p.start * 1000,
        text: p.text,
      }));
    }
    return transcript;
  }, [useParagraphs, paragraphs, transcript]);

  // In paragraph mode, render search results through `TranscriptParagraphs`
  // (filtered to the matching rows) so annotation highlights remain
  // visible. The legacy text-only `TranscriptSearchResults` view runs
  // off raw `highlighted` HTML and has no annotation awareness.
  const matchedParagraphs = useMemo(() => {
    if (!useParagraphs || !paragraphs) return null;
    const matchedIds = new Set(searchResults.map((r) => r.id));
    return paragraphs.filter((_, i) => matchedIds.has(i));
  }, [useParagraphs, paragraphs, searchResults]);

  const handleSearchClick = () => {
    $isSearchActive.set(true);
  };

  const handleCloseSearch = () => {
    resetSearch();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    $searchQuery.set(query);
    void performSearch(query, searchableLines);
  };

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className="h-full">
      <Tabs.Root
        defaultValue={hasPlaylist ? 'playlist' : 'transcript'}
        className="border-fancy-pants sticky top-4 bottom-4 isolate flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900"
      >
        {/* Tabs Header */}
        {hasPlaylist ? (
          <Tabs.List className="relative flex border-b border-zinc-200 dark:border-zinc-800">
            <Tabs.Tab
              value="playlist"
              className="text-secondary hover:text-primary data-[active]:text-primary flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors"
            >
              <IconListNumbers size={16} />
              <span>
                {playlistContext?.listType === 'series' ? 'Series' : 'Playlist'}
              </span>
            </Tabs.Tab>
            <Tabs.Tab
              value="transcript"
              className="text-secondary hover:text-primary data-[active]:text-primary flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors"
            >
              <IconTextCaption size={16} />
              <span>Transcript</span>
            </Tabs.Tab>
            {/* Sliding active-tab underline (replaces the previous static
                per-tab border) so switching tabs animates like elsewhere. */}
            <Tabs.Indicator
              className="bg-brand absolute bottom-0 h-[2px] transition-all duration-200"
              style={{
                left: 'var(--active-tab-left)',
                width: 'var(--active-tab-width)',
              }}
            />
          </Tabs.List>
        ) : null}

        {/* Transcript Panel */}
        <Tabs.Panel
          value="transcript"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {/* Transcript Header */}
          <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-2.5 dark:border-zinc-800">
            {isSearchActive ? (
              <>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder="Search transcript..."
                    className="text-primary w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1.5 pr-8 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-800"
                    // oxlint-disable-next-line jsx-a11y/no-autofocus -- this is rendered by user interaction
                    autoFocus
                  />
                  {hasQuery ? (
                    <div className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-400">
                      {searchResults.length}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleCloseSearch}
                  className="rounded-lg p-2 hover:bg-white/10"
                  aria-label="Close search"
                >
                  <IconX size={16} className="text-primary/80" />
                </button>
              </>
            ) : (
              <>
                <h3 className="text-primary flex-1 text-sm font-medium">
                  Transcript
                </h3>
                <button
                  type="button"
                  className="rounded-lg p-2 hover:bg-white/10"
                  onClick={handleSearchClick}
                >
                  <IconSearch size={16} className="text-primary/80" />
                </button>
              </>
            )}
          </div>

          {/* Pinned "Ask AI" row — escalate the typed find to a question.
                The answer renders in the main column (above the info tabs). */}
          {isSearchActive && hasQuery ? (
            <button
              type="button"
              onClick={() => askVideoQuestion(searchQuery)}
              className="text-primary flex w-full shrink-0 items-center gap-2 border-b border-zinc-200 px-5 py-2.5 text-left text-sm transition-colors hover:bg-white/10 dark:border-zinc-800"
            >
              <IconSparkles
                size={16}
                className="shrink-0 text-indigo-500 dark:text-indigo-300"
                aria-hidden="true"
              />
              <span className="truncate">
                Ask AI about this video:{' '}
                <span className="text-secondary">“{searchQuery}”</span>
              </span>
            </button>
          ) : null}

          {/* Transcript Content — search results take precedence over
                the body view in both paragraph and legacy modes.
                `TranscriptSearchResults` owns the empty-state copy for
                both modes; in paragraph mode we delegate to it when
                there are no matches rather than duplicating the
                "No results found" text. */}
          <div className="fade-bottom flex-1 overflow-hidden">
            {isSearchActive && hasQuery ? (
              useParagraphs &&
              matchedParagraphs &&
              matchedParagraphs.length > 0 ? (
                <TranscriptParagraphs
                  paragraphs={matchedParagraphs}
                  isTranscriptProcessing={isTranscriptProcessing}
                  highlightQuery={searchQuery}
                />
              ) : (
                <TranscriptSearchResults />
              )
            ) : useParagraphs ? (
              <TranscriptParagraphs
                paragraphs={paragraphs ?? []}
                isTranscriptProcessing={isTranscriptProcessing}
              />
            ) : (
              <Transcript
                transcript={transcript}
                isTranscriptProcessing={isTranscriptProcessing}
              />
            )}
          </div>
        </Tabs.Panel>

        {playlistContext ? (
          <Tabs.Panel
            value="playlist"
            className="fade-bottom flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <PlaylistSidebar
              key={`${playlistContext.listId}-${playlistContext.currentMediaId}`}
              listId={playlistContext.listId}
              listType={playlistContext.listType}
              listTitle={playlistContext.listTitle}
              items={playlistContext.items}
              currentMediaId={playlistContext.currentMediaId}
            />
          </Tabs.Panel>
        ) : null}
      </Tabs.Root>
    </div>
  );
}
