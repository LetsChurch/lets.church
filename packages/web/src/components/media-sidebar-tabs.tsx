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

import {
  type PlaylistPage,
  PlaylistSidebar,
} from '@/components/playlist-sidebar';
import {
  type TranscriptParagraph,
  TranscriptNoMatches,
  TranscriptParagraphs,
} from '@/components/transcript-paragraphs';
import {
  $isSearchActive,
  $searchQuery,
  $searchResults,
  performSearch,
  resetSearch,
} from '@/stores/transcript-search';
import { askVideoQuestion } from '@/stores/video-ask';

type MediaSidebarTabsProps = {
  paragraphs: Array<TranscriptParagraph>;
  isTranscriptProcessing: boolean;
  playlistContext?: {
    listId: string;
    listType: 'playlist' | 'series';
    listTitle?: string;
    initialPage: PlaylistPage;
    currentMediaId: string;
    currentPosition: number | null;
    total: number;
  };
  // Slot the media page docks the player into once the inline player scrolls
  // out of view (see useDockedPlayer). Height is 0 while undocked.
  dockSlotRef?: React.Ref<HTMLDivElement>;
  dockSlotHeight?: number;
};

export function MediaSidebarTabs({
  paragraphs,
  isTranscriptProcessing,
  playlistContext,
  dockSlotRef,
  dockSlotHeight = 0,
}: MediaSidebarTabsProps) {
  const hasPlaylist = Boolean(playlistContext);

  const isSearchActive = useStore($isSearchActive);
  const searchQuery = useStore($searchQuery);
  const searchResults = useStore($searchResults);

  // Search results render through `TranscriptParagraphs` (filtered to the
  // matching rows) so annotation highlights remain visible.
  const matchedParagraphs = useMemo(() => {
    const matchedIds = new Set(searchResults);
    return paragraphs.filter((_, i) => matchedIds.has(i));
  }, [paragraphs, searchResults]);

  const handleSearchClick = () => {
    $isSearchActive.set(true);
  };

  const handleCloseSearch = () => {
    resetSearch();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    $searchQuery.set(query);
    void performSearch(query, paragraphs);
  };

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className="h-full">
      <div className="sticky top-4 bottom-4 flex h-[calc(100vh-6rem)] flex-col">
        {/* The docked player is position: fixed over this slot; the height (and
          gap) transition so the tabs slide down as the player slides in. */}
        <div
          ref={dockSlotRef}
          aria-hidden="true"
          className="shrink-0 transition-[height,margin] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
          style={{
            height: `${dockSlotHeight}px`,
            marginBottom: dockSlotHeight > 0 ? '1rem' : 0,
          }}
        />
        <Tabs.Root
          defaultValue={hasPlaylist ? 'playlist' : 'transcript'}
          className="border-fancy-pants isolate flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900"
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
                  {playlistContext?.listType === 'series'
                    ? 'Series'
                    : 'Playlist'}
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
                the body view. */}
            <div className="fade-bottom flex-1 overflow-hidden">
              {isSearchActive && hasQuery ? (
                matchedParagraphs.length > 0 ? (
                  <TranscriptParagraphs
                    paragraphs={matchedParagraphs}
                    isTranscriptProcessing={isTranscriptProcessing}
                    highlightQuery={searchQuery}
                  />
                ) : (
                  <TranscriptNoMatches />
                )
              ) : (
                <TranscriptParagraphs
                  paragraphs={paragraphs}
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
                initialPage={playlistContext.initialPage}
                currentMediaId={playlistContext.currentMediaId}
                currentPosition={playlistContext.currentPosition}
                total={playlistContext.total}
              />
            </Tabs.Panel>
          ) : null}
        </Tabs.Root>
      </div>
    </div>
  );
}
