import type { EncryptedPayload } from '@letschurch/util/server/encrypted-payload-types';
import type { SendMailOptions } from 'nodemailer';

export type CredentialEmailArgs = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type PlaintextEmailInput = {
  kind: 'plaintext';
  email: SendMailOptions;
};

export type EncryptedCredentialEmailInput = {
  kind: 'encrypted';
  payload: EncryptedPayload;
};

export type SendEmailWorkflowInput =
  | PlaintextEmailInput
  | EncryptedCredentialEmailInput
  // Raw SendMailOptions is retained for already-started histories and callers
  // that predate the discriminated input.
  | SendMailOptions;
