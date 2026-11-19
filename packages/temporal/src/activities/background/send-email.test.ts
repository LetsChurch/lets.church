import { describe, expect, test } from 'vitest';

import { redactedSmtpFailure } from './send-email';

// Shaped like nodemailer's errors: the reply in `response` (and the message)
// quotes the recipient.
function smtpError(responseCode: number, enhanced: string, text: string) {
  const response = `${responseCode} ${enhanced} <jane@example.com>: ${text}`;
  return Object.assign(
    new Error(`Can't send mail - all recipients were rejected: ${response}`),
    { code: 'EENVELOPE', responseCode, response },
  );
}

describe('redactedSmtpFailure', () => {
  test('keeps only PII-free codes, never the server reply', () => {
    const failure = redactedSmtpFailure(
      smtpError(550, '5.1.1', 'Recipient address rejected'),
    );
    expect(failure.message).toBe(
      'Failed to send email (EENVELOPE SMTP 550 5.1.1)',
    );
    expect(failure.message).not.toContain('jane@example.com');
    expect(failure.cause).toBeUndefined();
  });

  test('bad-mailbox rejections (5.1.x) are not retried', () => {
    const failure = redactedSmtpFailure(
      smtpError(550, '5.1.1', 'Recipient address rejected'),
    );
    expect(failure.nonRetryable).toBe(true);
    expect(failure.type).toBe('SmtpRecipientRejected');
  });

  test('quota, auth, and other failures stay retryable', () => {
    for (const err of [
      smtpError(550, '5.4.5', 'Daily sending quota exceeded'),
      smtpError(535, '5.7.8', 'Authentication failed'),
      smtpError(421, '4.7.0', 'Try again later'),
      Object.assign(new Error('550 rejected <jane@example.com>'), {
        responseCode: 550,
      }),
      // Sender-side 5.1.x and a dotted IP in the reply text.
      smtpError(550, '5.1.8', 'Bad sender address'),
      Object.assign(new Error('421 too many connections'), {
        responseCode: 421,
        response: '421 Too many connections from [5.1.20.3]',
      }),
    ]) {
      expect(redactedSmtpFailure(err).nonRetryable).toBe(false);
    }
  });

  test('keeps TLS error codes', () => {
    const tls = redactedSmtpFailure(
      Object.assign(new Error('Hostname/IP does not match'), {
        code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      }),
    );
    expect(tls.message).toBe(
      'Failed to send email (ERR_TLS_CERT_ALTNAME_INVALID)',
    );
  });

  test('handles errors with no SMTP details', () => {
    const network = redactedSmtpFailure(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:587'), {
        code: 'ECONNECTION',
      }),
    );
    expect(network.message).toBe('Failed to send email (ECONNECTION)');
    expect(network.nonRetryable).toBe(false);
    expect(redactedSmtpFailure('boom').message).toBe('Failed to send email');
  });
});
