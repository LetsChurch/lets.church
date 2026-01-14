import { prisma } from '@letschurch/db';
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
) {
  moduleLogger.info(`Sending verification email for user ${userId}`);

  const emailObj = await prisma.appUserEmail.findUniqueOrThrow({
    select: { id: true, key: true },
    where: { email },
  });

  const verifyUrl = `${getWebUrl()}/auth/verify?${new URLSearchParams({
    userId: uuidTranslator.fromUUID(userId),
    emailId: uuidTranslator.fromUUID(emailObj.id),
    emailKey: uuidTranslator.fromUUID(emailObj.key),
  })}`;

  const subject = `Welcome to Let's Church! Please verify your email.`;
  const text = stripIndent`
    Welcome to Let's Church, ${username}!

    Please visit the following link to verify your email: ${verifyUrl}
  `;
  const html = emailHtml(
    'Welcome!',
    stripIndent`
        <p>Welcome to Let's Church, <b>${sanitizeForHtml(username)}</b>!</p>

        <p>Please click the button below to verify your email address:</p>

        <p>
          <a href="${verifyUrl}" style="display: inline-block; padding: 10px 20px; background-color: #228be6; color: white; text-decoration: none; border-radius: 4px;">Verify Email</a>
        </p>

        <p style="color: #868e96; font-size: 14px;">Or copy and paste this link into your browser: ${verifyUrl}</p>
      `,
  ).html;

  await (await client).workflow.start(sendEmailWorkflow, {
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
