import { randomBytes } from 'node:crypto';

import { encryptPayload } from '@letschurch/util/server/encrypted-payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activity: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({ sendEmail: mocks.activity }),
}));

vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: mocks.sendMail }),
}));

import sendEmailActivity from '../../activities/background/send-email';
import { sendEmailWorkflow } from './send-email';
import type { CredentialEmailArgs } from './send-email-types';

const secret = `test-key:${randomBytes(32).toString('base64url')}`;
const email: CredentialEmailArgs = {
  from: 'hello@example.test',
  to: 'member@example.test',
  subject: 'A test email',
  text: 'Plain text body',
  html: '<p>HTML body</p>',
};

beforeEach(() => {
  process.env.PASSWORDLESS_EMAIL_ENCRYPTION_KEY = secret;
  process.env.SMTP_URL = 'smtp://example.test';
  mocks.activity.mockReset();
  mocks.sendMail.mockReset().mockResolvedValue({ messageId: 'test-message' });
});

describe('sendEmailWorkflow', () => {
  it('forwards legacy plaintext input unchanged for replay compatibility', async () => {
    await sendEmailWorkflow(email);

    expect(mocks.activity).toHaveBeenCalledWith(email);
  });

  it('forwards encrypted input without decrypting it in workflow code', async () => {
    const input = {
      kind: 'encrypted' as const,
      payload: encryptPayload(JSON.stringify(email), secret),
    };

    await sendEmailWorkflow(input);

    expect(mocks.activity).toHaveBeenCalledWith(input);
  });
});

describe('sendEmail activity', () => {
  it('sends discriminated plaintext input for ordinary email', async () => {
    await sendEmailActivity({ kind: 'plaintext', email });

    expect(mocks.sendMail).toHaveBeenCalledWith(email);
  });

  it('decrypts credential email only inside the activity before sending', async () => {
    const payload = encryptPayload(JSON.stringify(email), secret);

    await sendEmailActivity({ kind: 'encrypted', payload });

    expect(mocks.sendMail).toHaveBeenCalledWith(email);
  });

  it('fails closed on tampered encrypted input', async () => {
    const payload = encryptPayload(JSON.stringify(email), secret);
    payload.tag = `${payload.tag.slice(0, -1)}${payload.tag.endsWith('A') ? 'B' : 'A'}`;

    await expect(
      sendEmailActivity({ kind: 'encrypted', payload }),
    ).rejects.toThrow('Invalid encrypted payload');
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
