import { prisma } from '@letschurch/db';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';
import { client } from '../../client';
import { BACKGROUND_QUEUE } from '../../queues';
import { emailHtml } from '../../util/email';
import logger from '../../util/logger';
import { uuidTranslator } from '../../util/uuid';
import { sendEmailWorkflow } from '../../workflows/background/send-email';

const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);

const moduleLogger = logger.child({
  module: 'temporal/activities/background/send-verification-email',
  temporalActivity: 'sendVerificationEmail',
});

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

  const verifyUrl = `${WEB_URL}/auth/verify?${new URLSearchParams({
    userId: uuidTranslator.fromUUID(userId),
    emailId: uuidTranslator.fromUUID(emailObj.id),
    emailKey: uuidTranslator.fromUUID(emailObj.key),
  })}`;

  const subject = `Welcome to Let's Church! Please verify your email.`;
  const text = `Welcome, ${username}! Please visit the following link to verify your email: ${verifyUrl}`;
  const html = emailHtml(
    'Welcome!',
    stripIndent`
        Welcome to Let's Church, <b>${username}</b>! Please click <a href="${verifyUrl}">here</a> to verify
        your email.

        Alternatively, visit the following link to verify your email: ${verifyUrl}
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
