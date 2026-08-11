import { describe, expect, it } from 'vitest';

import { createPlaylistSchema, updatePlaylistSchema } from './channel';

const channelId = '00000000-0000-4000-8000-000000000001';
const playlistId = '00000000-0000-4000-8000-000000000002';

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
