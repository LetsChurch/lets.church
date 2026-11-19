import {
  decryptPayload,
  validateEncryptedPayloadKey,
} from '@letschurch/util/server/encrypted-payload';
import { ApplicationFailure } from '@temporalio/activity';
import { createTransport, type SendMailOptions } from 'nodemailer';
import { z } from 'zod';

import logger from '../../util/logger';
import type {
  CredentialEmailArgs,
  SendEmailWorkflowInput,
} from '../../workflows/background/send-email-types';

export type EmailArgs = SendMailOptions;

const moduleLogger = logger.child({
  module: 'temporal/activities/background/send-email',
  temporalActivity: 'sendEmail',
});

let transport: ReturnType<typeof createTransport> | null = null;

export function validateSendEmailConfig() {
  z.object({ SMTP_URL: z.string() }).parse(process.env);
  validateEncryptedPayloadKey();
}

function getTransport() {
  if (!transport) {
    const { SMTP_URL } = z.object({ SMTP_URL: z.string() }).parse(process.env);
    transport = createTransport(SMTP_URL, {
      opportunisticTLS: true,
    });
  }
  return transport;
}
const credentialEmailSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    subject: z.string(),
    text: z.string(),
    html: z.string(),
  })
  .strict();

function resolveEmailArgs(input: SendEmailWorkflowInput): SendMailOptions {
  if ('kind' in input && input.kind === 'encrypted') {
    const plaintext = decryptPayload(input.payload);
    return credentialEmailSchema.parse(
      JSON.parse(plaintext),
    ) satisfies CredentialEmailArgs;
  }
  if ('kind' in input && input.kind === 'plaintext') return input.email;
  return input;
}

/**
 * An SMTP failure with the server's reply removed. Replies quote the recipient
 * ("550 5.1.1 <jane@…>: rejected"), and a thrown error lands in workflow
 * history and worker logs, so encrypted (PII-bearing) sends rethrow only the
 * PII-free parts: nodemailer's error code, the reply code, and the enhanced
 * status code (RFC 3463).
 *
 * Only bad-destination statuses are treated as permanent. A bare 550 is not:
 * providers also use it for temporary limits such as Gmail's "550 5.4.5 Daily
 * sending quota exceeded".
 */
// RFC 3463 destination-address failures: bad mailbox, bad system, bad syntax,
// mailbox moved, invalid recipient. (5.1.7/5.1.8 are sender-side problems.)
const BAD_DESTINATION_STATUSES = new Set([
  '5.1.1',
  '5.1.2',
  '5.1.3',
  '5.1.6',
  '5.1.10',
]);

export function redactedSmtpFailure(err: unknown) {
  const fields: { code?: unknown; responseCode?: unknown; response?: unknown } =
    err && typeof err === 'object' ? err : {};
  // Error codes are constants such as EENVELOPE or ERR_TLS_CERT_ALTNAME_INVALID.
  const code =
    typeof fields.code === 'string' && /^E[A-Z0-9_]+$/.test(fields.code)
      ? fields.code
      : undefined;
  const responseCode =
    typeof fields.responseCode === 'number' ? fields.responseCode : undefined;
  // The enhanced status code directly follows the reply code ("550 5.1.1 …");
  // matching anywhere else could pick up an IP address in the reply text.
  const enhancedStatus =
    typeof fields.response === 'string'
      ? /^\d{3}[ -]([245]\.\d{1,3}\.\d{1,3})\b/.exec(fields.response)?.[1]
      : undefined;
  const details = [
    code,
    responseCode ? `SMTP ${responseCode}` : undefined,
    enhancedStatus,
  ]
    .filter(Boolean)
    .join(' ');
  const message = `Failed to send email${details ? ` (${details})` : ''}`;
  return enhancedStatus && BAD_DESTINATION_STATUSES.has(enhancedStatus)
    ? ApplicationFailure.nonRetryable(message, 'SmtpRecipientRejected')
    : ApplicationFailure.retryable(message, 'SmtpFailed');
}

export default async function sendEmailActivity(input: SendEmailWorkflowInput) {
  const args = resolveEmailArgs(input);
  // Encrypted payloads carry credentials or donor PII; keep recipients out of
  // logs for those.
  if ('kind' in input && input.kind === 'encrypted') {
    moduleLogger.info('Sending encrypted email');
    // Outside the try: a configuration error (missing SMTP_URL) carries no
    // PII and should surface as itself.
    const smtp = getTransport();
    try {
      await smtp.sendMail(args);
    } catch (err) {
      throw redactedSmtpFailure(err);
    }
    moduleLogger.info('Done!');
    // The send result echoes the recipients, and activity results are stored
    // in workflow history.
    return;
  }
  moduleLogger.info(`Sending email from ${args.from} to ${args.to}`);
  const res = await getTransport().sendMail(args);
  moduleLogger.info('Done!');
  return res;
}
