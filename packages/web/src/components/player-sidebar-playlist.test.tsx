import { describe, expect, test, vi } from 'vitest';

import {
  boundaryScrollTop,
  loadPlaylistBoundary,
  type PlaylistItem,
  type PlaylistPageState,
} from './playlist-sidebar';

function item(id: string): PlaylistItem {
  return {
    id,
    title: id,
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

describe('playlist sidebar paging', () => {
  test('loads both boundaries lazily and deduplicates in stable order', async () => {
    const initial: PlaylistPageState = {
      items: [item('2'), item('3')],
      previousCursor: 'before-2',
      nextCursor: 'after-3',
    };
    const loadPage = vi.fn(async (cursor: string) => {
      if (cursor === 'before-2') {
        return {
          items: [item('1'), item('2')],
          previousCursor: null,
          nextCursor: 'after-2',
        };
      }
      return {
        items: [item('3'), item('4')],
        previousCursor: 'before-3',
        nextCursor: null,
      };
    });

    expect(loadPage).not.toHaveBeenCalled();
    const withEarlier = await loadPlaylistBoundary(initial, 'before', loadPage);
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(loadPage).toHaveBeenLastCalledWith('before-2');
    expect(withEarlier.items.map(({ id }) => id)).toEqual(['1', '2', '3']);
    expect(withEarlier.previousCursor).toBeNull();
    expect(withEarlier.nextCursor).toBe('after-3');

    const complete = await loadPlaylistBoundary(withEarlier, 'after', loadPage);
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(loadPage).toHaveBeenLastCalledWith('after-3');
    expect(complete.items.map(({ id }) => id)).toEqual(['1', '2', '3', '4']);
    expect(complete.previousCursor).toBeNull();
    expect(complete.nextCursor).toBeNull();
  });

  test('does not query when the requested boundary has no cursor', async () => {
    const state: PlaylistPageState = {
      items: [item('1')],
      previousCursor: null,
      nextCursor: null,
    };
    const loadPage = vi.fn();

    await expect(loadPlaylistBoundary(state, 'before', loadPage)).resolves.toBe(
      state,
    );
    await expect(loadPlaylistBoundary(state, 'after', loadPage)).resolves.toBe(
      state,
    );
    expect(loadPage).not.toHaveBeenCalled();
  });

  test('preserves the visible scroll position when items are prepended', () => {
    const previous = { scrollHeight: 800, scrollTop: 240 };

    expect(boundaryScrollTop('before', previous, 1120)).toBe(560);
    expect(boundaryScrollTop('after', previous, 1120)).toBe(240);
  });
});
