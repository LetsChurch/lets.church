import { randomBytes } from 'node:crypto';

import { decryptPayload } from '@letschurch/util/server/encrypted-payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  issueAuthToken: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/temporal', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('./auth-token', () => ({
  PASSWORD_RESET_TTL_MINUTES: 20,
  issueAuthToken: mocks.issueAuthToken,
}));
vi.mock('./reset-password-email', () => ({
  generateResetPasswordEmail: (token: string, username: string) => ({
    text: `Reset ${username} at https://example.test/reset?token=${token}`,
    html: `<a href="https://example.test/reset?token=${token}">Reset ${username}</a>`,
  }),
}));

import { sendPasswordResetEmail } from './password-reset';

const secret = `test-key:${randomBytes(32).toString('base64url')}`;
const token = 'dummy-reset-bearer-token';
const link = `https://example.test/reset?token=${token}`;

beforeEach(() => {
  process.env.PASSWORDLESS_EMAIL_ENCRYPTION_KEY = secret;
  mocks.issueAuthToken.mockReset().mockResolvedValue({
    id: 'reset-record',
    token,
  });
  mocks.sendEmail.mockReset().mockResolvedValue(undefined);
});

describe('sendPasswordResetEmail', () => {
  it('starts Temporal with only an opaque credential-email envelope', async () => {
    await sendPasswordResetEmail({
      userId: 'user-1',
      username: 'member',
      email: 'member@example.test',
    });

    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    const [workflowId, input] = mocks.sendEmail.mock.calls[0]!;
    expect(workflowId).toBe('password-reset:reset-record');
    expect(input.kind).toBe('encrypted');

    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(link);
    expect(serialized).not.toContain('Reset member');
    expect(serialized).not.toContain('Reset your password');

    expect(JSON.parse(decryptPayload(input.payload, secret))).toEqual({
      from: 'hello@lets.church',
      to: 'member@example.test',
      subject: "Reset your password for Let's Church",
      text: `Reset member at ${link}`,
      html: `<a href="${link}">Reset member</a>`,
    });
  });
});
