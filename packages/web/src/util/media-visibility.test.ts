import { describe, expect, it } from 'vitest';

// Import from the db-free rules module so the test doesn't pull in @letschurch/db
// (which parses DATABASE_URL at load) — `just test` runs without a database.
import { canViewMedia, isChannelRoutable } from './media-visibility-rules';

const approved = new Date('2020-01-01T00:00:00Z');

describe('isChannelRoutable', () => {
  it('is true for an approved, non-deleted, non-private channel', () => {
    expect(
      isChannelRoutable({ visibility: 'PUBLIC', approvedAt: approved }),
    ).toBe(true);
    expect(
      isChannelRoutable({ visibility: 'UNLISTED', approvedAt: approved }),
    ).toBe(true);
  });

  it('is false for private, unapproved, or deleted channels', () => {
    expect(
      isChannelRoutable({ visibility: 'PRIVATE', approvedAt: approved }),
    ).toBe(false);
    expect(isChannelRoutable({ visibility: 'PUBLIC', approvedAt: null })).toBe(
      false,
    );
    expect(
      isChannelRoutable({
        visibility: 'PUBLIC',
        approvedAt: approved,
        deletedAt: new Date(),
      }),
    ).toBe(false);
  });
});

describe('canViewMedia', () => {
  const routableChannel = {
    visibility: 'PUBLIC' as const,
    approvedAt: approved,
  };

  const base = {
    channelId: 'chan-1',
    channel: routableChannel,
    isSiteAdmin: false,
    memberChannelIds: new Set<string>(),
  };

  it('allows PUBLIC and UNLISTED media on a routable channel', () => {
    expect(canViewMedia({ ...base, upload: { visibility: 'PUBLIC' } })).toBe(
      true,
    );
    expect(canViewMedia({ ...base, upload: { visibility: 'UNLISTED' } })).toBe(
      true,
    );
  });

  it('hides everything on a non-routable channel, even PUBLIC media', () => {
    expect(
      canViewMedia({
        ...base,
        channel: { visibility: 'PRIVATE', approvedAt: approved },
        upload: { visibility: 'PUBLIC' },
      }),
    ).toBe(false);
  });

  it('hides deleted uploads', () => {
    expect(
      canViewMedia({
        ...base,
        upload: { visibility: 'PUBLIC', deletedAt: new Date() },
      }),
    ).toBe(false);
  });

  describe('PRIVATE media', () => {
    const privateUpload = { upload: { visibility: 'PRIVATE' as const } };

    it('is hidden from non-members', () => {
      expect(canViewMedia({ ...base, ...privateUpload })).toBe(false);
    });

    it('is visible to channel members', () => {
      expect(
        canViewMedia({
          ...base,
          ...privateUpload,
          memberChannelIds: new Set(['chan-1']),
        }),
      ).toBe(true);
    });

    it('is visible to site admins', () => {
      expect(
        canViewMedia({ ...base, ...privateUpload, isSiteAdmin: true }),
      ).toBe(true);
    });

    it('membership of a different channel does not grant access', () => {
      expect(
        canViewMedia({
          ...base,
          ...privateUpload,
          memberChannelIds: new Set(['other-channel']),
        }),
      ).toBe(false);
    });
  });
});
