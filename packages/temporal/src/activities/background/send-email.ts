import {
  decryptPayload,
  validateEncryptedPayloadKey,
} from '@letschurch/util/server/encrypted-payload';
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

export default async function sendEmailActivity(input: SendEmailWorkflowInput) {
  const args = resolveEmailArgs(input);
  moduleLogger.info(`Sending email from ${args.from} to ${args.to}`);
  const res = await getTransport().sendMail(args);
  moduleLogger.info('Done!');
  return res;
}
