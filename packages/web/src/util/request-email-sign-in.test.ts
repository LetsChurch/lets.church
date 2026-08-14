import { randomBytes } from 'node:crypto';

import { decryptPayload } from '@letschurch/util/server/encrypted-payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  issueAuthToken: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/temporal', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('./auth-token', () => ({
  EMAIL_SIGN_IN_TTL_MINUTES: 20,
  issueAuthToken: mocks.issueAuthToken,
}));
vi.mock('./email-sign-in-email', () => ({
  generateEmailSignInEmail: (token: string) => ({
    text: `Sign in at https://example.test/sign-in?token=${token}`,
    html: `<a href="https://example.test/sign-in?token=${token}">Sign in</a>`,
  }),
}));

import { sendEmailSignInLink } from './request-email-sign-in';

const secret = `test-key:${randomBytes(32).toString('base64url')}`;
const token = 'dummy-sign-in-bearer-token';
const link = `https://example.test/sign-in?token=${token}`;

beforeEach(() => {
  process.env.PASSWORDLESS_EMAIL_ENCRYPTION_KEY = secret;
  mocks.issueAuthToken.mockReset().mockResolvedValue({
    id: 'sign-in-record',
    token,
  });
  mocks.sendEmail.mockReset().mockResolvedValue(undefined);
});

describe('sendEmailSignInLink', () => {
  it('starts Temporal with only an opaque credential-email envelope', async () => {
    await sendEmailSignInLink({
      email: 'member@example.test',
      appUserId: 'user-1',
      returnTo: '/dashboard',
    });

    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const [workflowId, input] = mocks.sendEmail.mock.calls[0]!;
    expect(workflowId).toBe('email-sign-in:sign-in-record');
    expect(input.kind).toBe('encrypted');

    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(link);
    expect(serialized).not.toContain('Sign in at');
    expect(serialized).not.toContain('Your secure sign-in link');

    expect(JSON.parse(decryptPayload(input.payload, secret))).toEqual({
      from: 'hello@lets.church',
      to: 'member@example.test',
      subject: "Your secure sign-in link for Let's Church",
      text: `Sign in at ${link}`,
      html: `<a href="${link}">Sign in</a>`,
    });
  });
});
