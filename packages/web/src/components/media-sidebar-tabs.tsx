import { useStore } from '@nanostores/react';
import {
  IconListNumbers,
  IconSearch,
  IconTextCaption,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { PlaylistSidebar } from '@/components/playlist-sidebar';
import { Transcript } from '@/components/transcript';
import { TranscriptSearchResults } from '@/components/transcript-search-results';
import {
  $isSearchActive,
  $searchQuery,
  $searchResults,
  performSearch,
  resetSearch,
} from '@/stores/transcript-search';

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
  playlistContext,
}: MediaSidebarTabsProps) {
  const hasPlaylist = Boolean(playlistContext);
  const [activeTab, setActiveTab] = useState<'transcript' | 'playlist'>(
    hasPlaylist ? 'playlist' : 'transcript',
  );

  const isSearchActive = useStore($isSearchActive);
  const searchQuery = useStore($searchQuery);
  const searchResults = useStore($searchResults);

  const handleSearchClick = () => {
    $isSearchActive.set(true);
  };

  const handleCloseSearch = () => {
    resetSearch();
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    $searchQuery.set(query);
    void performSearch(query, transcript);
  };

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div>
      <div className="sticky top-4 bottom-4 isolate flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border-fancy-pants bg-zinc-100 dark:bg-zinc-900">
        {/* Tabs Header */}
        {hasPlaylist ? (
          <div className="flex border-zinc-200 border-b dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('playlist')}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                activeTab === 'playlist'
                  ? 'border-brand border-b-2 text-brand'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              <IconListNumbers size={16} />
              <span>Playlist</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transcript')}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                activeTab === 'transcript'
                  ? 'border-brand border-b-2 text-brand'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              <IconTextCaption size={16} />
              <span>Transcript</span>
            </button>
          </div>
        ) : null}

        {/* Tab Content */}
        {activeTab === 'transcript' ? (
          <>
            {/* Transcript Header */}
            <div className="flex items-center gap-2 border-zinc-200 border-b px-5 py-2.5 dark:border-zinc-800">
              {isSearchActive ? (
                <>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={handleSearchChange}
                      placeholder="Search transcript..."
                      className="w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1.5 pr-8 text-primary text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-800"
                      // biome-ignore lint/a11y/noAutofocus: this is rendered by user interaction
                      autoFocus
                    />
                    {hasQuery ? (
                      <div className="-translate-y-1/2 absolute top-1/2 right-2 text-gray-400 text-xs">
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
                  <h3 className="flex-1 font-medium text-primary text-sm">
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

            {/* Transcript Content */}
            <div className="fade-bottom flex-1 overflow-hidden">
              {isSearchActive && hasQuery ? (
                <TranscriptSearchResults />
              ) : (
                <Transcript transcript={transcript} />
              )}
            </div>
          </>
        ) : null}

        {activeTab === 'playlist' && playlistContext ? (
          <div className="fade-bottom flex flex-1 flex-col overflow-hidden">
            <PlaylistSidebar
              key={`${playlistContext.listId}-${playlistContext.currentMediaId}`}
              listId={playlistContext.listId}
              listType={playlistContext.listType}
              listTitle={playlistContext.listTitle}
              items={playlistContext.items}
              currentMediaId={playlistContext.currentMediaId}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
