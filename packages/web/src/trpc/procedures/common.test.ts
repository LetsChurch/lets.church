import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Context } from '@/trpc/context';

const mocks = vi.hoisted(() => {
  process.env.HCAPTCHA_SITE_KEY = 'test-site-key';
  process.env.MAPBOX_MAP_TOKEN = 'test-map-token';
  process.env.MAPBOX_SEARCHBOX_TOKEN = 'test-searchbox-token';

  return {
    findEmails: vi.fn(),
    findUser: vi.fn(),
    sendVerificationEmail: vi.fn(),
  };
});

vi.mock('@letschurch/db', () => ({
  ChannelInvitation: {},
  ChannelMembership: {},
  OrganizationInvitation: {},
  OrganizationMembership: {},
  db: {
    query: {
      AppUser: { findFirst: mocks.findUser },
      AppUserEmail: { findMany: mocks.findEmails },
    },
  },
}));

vi.mock('@/temporal', () => ({
  sendVerificationEmail: mocks.sendVerificationEmail,
}));

vi.mock('@/util/logger', () => ({
  default: {
    child: () => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

import { router } from '../trpc';
import { commonProcedures } from './common';

const commonRouter = router(commonProcedures);
const appUserId = '00000000-0000-4000-8000-000000000001';

function callerContext(): Context {
  return {
    isSiteAdmin: true,
    req: new Request('http://localhost/trpc'),
    resHeaders: new Headers(),
    session: { appUserId } as Context['session'],
  } as Context;
}

describe('resendVerificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({ username: 'member' });
    mocks.sendVerificationEmail.mockResolvedValue(undefined);
  });

  it('skips a legacy empty address and sends to a valid unverified address', async () => {
    mocks.findEmails.mockResolvedValue([
      { email: '' },
      { email: 'member@example.test' },
    ]);

    await expect(
      commonRouter.createCaller(callerContext()).resendVerificationEmail(),
    ).resolves.toEqual({ success: true });

    expect(mocks.sendVerificationEmail).toHaveBeenCalledOnce();
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith({
      userId: appUserId,
      username: 'member',
      email: 'member@example.test',
    });
  });

  it('rejects the request when only a legacy empty address is unverified', async () => {
    mocks.findEmails.mockResolvedValue([{ email: '' }]);

    await expect(
      commonRouter.createCaller(callerContext()).resendVerificationEmail(),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'No unverified email found',
    });

    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('getUnverifiedEmail', () => {
  it('ignores a legacy empty address before a verified primary address', async () => {
    mocks.findEmails.mockResolvedValue([
      { email: '', verifiedAt: null },
      { email: 'member@example.test', verifiedAt: new Date() },
    ]);

    await expect(
      commonRouter.createCaller(callerContext()).getUnverifiedEmail(),
    ).resolves.toBeNull();
  });
});
