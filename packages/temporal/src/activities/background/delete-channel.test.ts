import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  returning: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@letschurch/db', () => ({
  Channel: { id: 'channel.id' },
  ChannelSubscription: { channelId: 'channelSubscription.channelId' },
  db: { delete: mocks.delete },
  OrganizationChannelAssociation: {
    channelId: 'organizationChannelAssociation.channelId',
  },
  UploadRecord: { channelId: 'uploadRecord.channelId' },
  UploadState: {
    backupStatus: 'uploadState.backupStatus',
    channelId: 'uploadState.channelId',
    id: 'uploadState.id',
    uploadType: 'uploadState.uploadType',
  },
}));

vi.mock('@letschurch/s3/backup', () => ({ backupS3: {} }));
vi.mock('@letschurch/s3/public', () => ({ publicS3: {} }));
vi.mock('@temporalio/activity', () => ({
  Context: { current: () => ({ heartbeat: vi.fn() }) },
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));
vi.mock('../../util/logger', () => {
  const mockedLogger = {
    child: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  mockedLogger.child.mockReturnValue(mockedLogger);
  return { default: mockedLogger };
});

import {
  ChannelSubscription,
  OrganizationChannelAssociation,
} from '@letschurch/db';

import { deleteChannelAssociations } from './delete-channel';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.returning.mockResolvedValue([]);
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.delete.mockReturnValue({ where: mocks.where });
});

describe('deleteChannelAssociations', () => {
  test('leaves memberships for the final channel cascade', async () => {
    await expect(deleteChannelAssociations('channel-1')).resolves.toBe(true);

    expect(mocks.delete.mock.calls.map(([table]) => table)).toEqual([
      ChannelSubscription,
      OrganizationChannelAssociation,
    ]);
    expect(mocks.returning).toHaveBeenCalledTimes(2);
  });
});
