import { describe, expect, it } from 'vitest';

import {
  channelUploadsQuerySchema,
  createPlaylistSchema,
  updatePlaylistSchema,
} from './channel';

const channelId = '00000000-0000-4000-8000-000000000001';
const playlistId = '00000000-0000-4000-8000-000000000002';

describe('channel upload sorting', () => {
  it('defaults to newest uploads first', () => {
    const result = channelUploadsQuerySchema.parse({
      channelId,
      page: 1,
      limit: 20,
    });

    expect(result.sort).toBe('createdAt');
    expect(result.direction).toBe('desc');
  });

  it.each([
    ['title', 'asc'],
    ['title', 'desc'],
    ['visibility', 'asc'],
    ['visibility', 'desc'],
    ['views', 'asc'],
    ['views', 'desc'],
    ['createdAt', 'asc'],
    ['createdAt', 'desc'],
  ] as const)('accepts %s sorting in %s order', (sort, direction) => {
    expect(
      channelUploadsQuerySchema.parse({
        channelId,
        page: 1,
        limit: 20,
        sort,
        direction,
      }),
    ).toMatchObject({ sort, direction });
  });

  it('rejects unsupported sort columns', () => {
    expect(
      channelUploadsQuerySchema.safeParse({
        channelId,
        page: 1,
        limit: 20,
        sort: 'comments',
        direction: 'desc',
      }).success,
    ).toBe(false);
  });
});

describe('playlist visibility schemas', () => {
  it('defaults new lists to public', () => {
    expect(
      createPlaylistSchema.parse({
        channelId,
        title: 'Membership Class',
      }).visibility,
    ).toBe('PUBLIC');
  });

  it('does not default visibility during an update', () => {
    const result = updatePlaylistSchema.parse({
      channelId,
      playlistId,
      title: 'Membership Class',
    });

    expect(result).not.toHaveProperty('visibility');
  });

  it('accepts an explicit unlisted update and rejects private lists', () => {
    expect(
      updatePlaylistSchema.parse({
        channelId,
        playlistId,
        title: 'Membership Class',
        visibility: 'UNLISTED',
      }).visibility,
    ).toBe('UNLISTED');

    expect(
      updatePlaylistSchema.safeParse({
        channelId,
        playlistId,
        title: 'Membership Class',
        visibility: 'PRIVATE',
      }).success,
    ).toBe(false);
  });
});
