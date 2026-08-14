import type { Meta, StoryObj } from '@storybook/react';
import { useCallback, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import {
  PlaylistSidebar,
  type PlaylistItem,
  type PlaylistPage,
} from './playlist-sidebar';

function item(index: number): PlaylistItem {
  return {
    id: `media-${index}`,
    title: `Item ${index}`,
    thumbnailUrl: null,
    lengthSeconds: null,
    publishedAt: null,
    channel: {
      id: 'channel',
      name: 'Channel',
      slug: 'channel',
      avatarUrl: null,
    },
  };
}

const initialPage: PlaylistPage = {
  items: Array.from({ length: 10 }, (_, index) => item(index + 11)),
  previousCursor: 'before-11',
  nextCursor: null,
};

function RefetchHarness() {
  const [page, setPage] = useState(initialPage);
  const loadPage = useCallback(async () => {
    return {
      items: Array.from({ length: 10 }, (_, index) => item(index + 1)),
      previousCursor: null,
      nextCursor: 'after-10',
    };
  }, []);

  return (
    <div className="flex h-[420px] w-[360px] flex-col">
      <button type="button" onClick={() => setPage({ ...initialPage })}>
        Supply refetched initial page
      </button>
      <div
        className="fade-bottom flex min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="mobile-playlist-body"
      >
        <PlaylistSidebar
          listId="list"
          listType="playlist"
          listTitle="Test playlist"
          initialPage={page}
          currentMediaId="not-on-this-page"
          currentPosition={15}
          total={20}
          loadPage={loadPage}
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'Components/PlaylistSidebar',
  component: PlaylistSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    listId: 'list',
    listType: 'playlist',
    initialPage,
    currentMediaId: 'not-on-this-page',
    currentPosition: 15,
    total: 20,
  },
} satisfies Meta<typeof PlaylistSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RetainsLoadedPagesAcrossRefetch: Story = {
  render: () => <RefetchHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const drawerBody = canvas.getByTestId('mobile-playlist-body');
    const scrollContainer = canvas.getByTestId('playlist-scroll-container');

    expect(drawerBody.scrollHeight).toBeLessThanOrEqual(
      drawerBody.clientHeight,
    );
    expect(scrollContainer.scrollHeight).toBeGreaterThan(
      scrollContainer.clientHeight,
    );

    scrollContainer.scrollTop = 180;
    const anchor = canvas.getByText('Item 15');
    const previousScrollTop = scrollContainer.scrollTop;
    const previousAnchorTop =
      anchor.getBoundingClientRect().top -
      scrollContainer.getBoundingClientRect().top;

    canvas.getByRole('button', { name: 'Load earlier items' }).click();
    await expect(canvas.findByText('Item 1')).resolves.toBeInTheDocument();

    const nextAnchorTop =
      anchor.getBoundingClientRect().top -
      scrollContainer.getBoundingClientRect().top;
    expect(scrollContainer.scrollTop).toBeGreaterThan(previousScrollTop);
    expect(Math.abs(nextAnchorTop - previousAnchorTop)).toBeLessThan(1);

    await userEvent.click(
      canvas.getByRole('button', { name: 'Supply refetched initial page' }),
    );
    expect(canvas.getByText('Item 1')).toBeInTheDocument();
  },
};
