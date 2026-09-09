import {
  AppSession,
  AppUser,
  OidcAuthorizationCode,
  OidcRefreshToken,
} from '@letschurch/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteUserAccount } from './delete-user';

const mocks = vi.hoisted(() => ({
  authorizationCodeWhere: vi.fn(),
  delete: vi.fn(),
  refreshSet: vi.fn(),
  refreshWhere: vi.fn(),
  sessionSet: vi.fn(),
  sessionWhere: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  userReturning: vi.fn(),
  userSet: vi.fn(),
  userWhere: vi.fn(),
}));

vi.mock('@letschurch/db', async () => {
  // The hoisted mock needs the real schema objects without importing the
  // connection-bearing package entry before DATABASE_URL can be replaced.
  const schema = await import('@letschurch/db/schema');
  return {
    ...schema,
    db: { transaction: mocks.transaction },
  };
});

const actingAdminId = '00000000-0000-4000-8000-000000000001';
const appUserId = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();

  mocks.userReturning.mockResolvedValue([{ id: appUserId }]);
  mocks.userWhere.mockReturnValue({ returning: mocks.userReturning });
  mocks.userSet.mockReturnValue({ where: mocks.userWhere });
  mocks.sessionWhere.mockResolvedValue([]);
  mocks.sessionSet.mockReturnValue({ where: mocks.sessionWhere });
  mocks.authorizationCodeWhere.mockResolvedValue([]);
  mocks.delete.mockReturnValue({ where: mocks.authorizationCodeWhere });
  mocks.refreshWhere.mockResolvedValue([]);
  mocks.refreshSet.mockReturnValue({ where: mocks.refreshWhere });
  mocks.update
    .mockReturnValueOnce({ set: mocks.userSet })
    .mockReturnValueOnce({ set: mocks.sessionSet })
    .mockReturnValueOnce({ set: mocks.refreshSet });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({ delete: mocks.delete, update: mocks.update }),
  );
});

describe('deleteUserAccount', () => {
  it('soft-deletes the user and revokes every renewable credential atomically', async () => {
    await expect(
      deleteUserAccount({ actingAdminId, appUserId }),
    ).resolves.toBeUndefined();

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenNthCalledWith(1, AppUser);
    expect(mocks.update).toHaveBeenNthCalledWith(2, AppSession);
    expect(mocks.delete).toHaveBeenCalledWith(OidcAuthorizationCode);
    expect(mocks.update).toHaveBeenNthCalledWith(3, OidcRefreshToken);

    const userUpdate = mocks.userSet.mock.calls[0]?.[0];
    const sessionUpdate = mocks.sessionSet.mock.calls[0]?.[0];
    const refreshUpdate = mocks.refreshSet.mock.calls[0]?.[0];
    expect(userUpdate).toEqual({
      deletedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(userUpdate.deletedAt).toBe(userUpdate.updatedAt);
    expect(sessionUpdate).toEqual({ deletedAt: userUpdate.deletedAt });
    expect(refreshUpdate).toEqual({ revokedAt: userUpdate.deletedAt });
  });

  it('rejects self-deletion before opening a transaction', async () => {
    await expect(
      deleteUserAccount({
        actingAdminId,
        appUserId: actingAdminId,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'You cannot delete yourself.',
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('reports missing and already-deleted users as not found', async () => {
    mocks.userReturning.mockResolvedValue([]);

    await expect(
      deleteUserAccount({ actingAdminId, appUserId }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'User not found',
    });

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.sessionSet).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
