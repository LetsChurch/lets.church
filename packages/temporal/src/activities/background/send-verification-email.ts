import { AppUserEmail, AppUserPendingEmail, db } from '@letschurch/db';
import { and, eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';

import { client } from '../../client';
import { BACKGROUND_QUEUE } from '../../queues';
import { emailHtml, sanitizeForHtml } from '../../util/email';
import logger from '../../util/logger';
import { uuidTranslator } from '../../util/uuid';
import { sendEmailWorkflow } from '../../workflows/background/send-email';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/send-verification-email',
  temporalActivity: 'sendVerificationEmail',
});

export function validateSendVerificationEmailConfig() {
  z.object({ WEB_URL: z.string() }).parse(process.env);
}

function getWebUrl(): string {
  const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);
  return WEB_URL;
}

export default async function sendVerificationEmailActivity(
  userId: string,
  username: string,
  email: string,
  // Optional so workflows already in flight (three args) keep working.
  kind: 'registration' | 'email-change' = 'registration',
) {
  moduleLogger.info(`Sending verification email for user ${userId}`);

  // An email change on an account with a verified address waits in
  // AppUserPendingEmail until this link is clicked; otherwise the address is
  // already on the account, unverified. /auth/verify accepts either id.
  const pendingObj =
    kind === 'email-change'
      ? await db
          .select({
            id: AppUserPendingEmail.id,
            key: AppUserPendingEmail.key,
          })
          .from(AppUserPendingEmail)
          .where(
            and(
              eq(AppUserPendingEmail.appUserId, userId),
              eq(AppUserPendingEmail.email, email),
            ),
          )
          .then((r) => r[0])
      : undefined;
  const emailObj =
    pendingObj ??
    (await db
      .select({ id: AppUserEmail.id, key: AppUserEmail.key })
      .from(AppUserEmail)
      .where(
        and(eq(AppUserEmail.appUserId, userId), eq(AppUserEmail.email, email)),
      )
      .then((r) => r[0]));

  invariant(emailObj, `Email ${email} not found`);

  const verifyUrl = `${getWebUrl()}/auth/verify?${new URLSearchParams({
    userId: uuidTranslator.fromUUID(userId),
    emailId: uuidTranslator.fromUUID(emailObj.id),
    emailKey: uuidTranslator.fromUUID(emailObj.key),
  })}`;

  const isChange = kind === 'email-change';
  const subject = isChange
    ? `Please verify your new Let's Church email address`
    : `Welcome to Let's Church! Please verify your email.`;
  const greeting = isChange
    ? `Hi ${username}, you asked to change the email address on your Let's Church account to this one.`
    : `Welcome to Let's Church, ${username}!`;
  const pendingNote = `The link works for 7 days. If you didn't ask for this, ignore this email; nothing changes.`;
  const text = stripIndent`
    ${greeting}

    Please visit the following link to verify your email: ${verifyUrl}
  `.concat(pendingObj ? `\n${pendingNote}` : '');
  const html = emailHtml(
    isChange ? 'Verify your email' : 'Welcome!',
    stripIndent`
        <p>${
          isChange
            ? `Hi <b>${sanitizeForHtml(username)}</b>, you asked to change the email address on your Let's Church account to this one.`
            : `Welcome to Let's Church, <b>${sanitizeForHtml(username)}</b>!`
        }</p>

        <p>Please click the button below to verify your email address:</p>

        <p>
          <a href="${verifyUrl}" style="display: inline-block; padding: 10px 20px; background-color: #228be6; color: white; text-decoration: none; border-radius: 4px;">Verify Email</a>
        </p>

        <p style="color: #868e96; font-size: 14px;">Or copy and paste this link into your browser: ${verifyUrl}</p>${
          pendingObj
            ? `\n\n<p style="color: #868e96; font-size: 14px;">${pendingNote}</p>`
            : ''
        }
      `,
  ).html;

  await (
    await client
  ).workflow.start(sendEmailWorkflow, {
    args: [
      {
        from: 'hello@lets.church',
        to: email,
        subject,
        text,
        html,
      },
    ],
    workflowId: `signup-email:${email}:${Date.now()}`,
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

  moduleLogger.info(`Started verification email workflow for ${email}`);
}
