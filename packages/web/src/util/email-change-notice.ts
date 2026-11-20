import { emailHtml, sanitizeForHtml } from '@letschurch/temporal/util/email';
import { encryptPayload } from '@letschurch/util/server/encrypted-payload';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';

import { sendEmail } from '@/temporal';

const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);

export type EmailChangeNoticeStage = 'requested' | 'confirmed';

// Tells the account's verified address about a change to it, so someone
// using a stolen session can't move the account to their own inbox
// unnoticed. "requested" goes out while the old address still controls the
// account (the owner can cancel and change their password); "confirmed" is
// the last account email this address gets.
export function generateEmailChangeNotice(input: {
  stage: EmailChangeNoticeStage;
  username: string;
  newEmail: string;
}) {
  const profileUrl = `${WEB_URL}/dashboard/account/profile`;
  const safeUrl = sanitizeForHtml(profileUrl);
  const safeName = sanitizeForHtml(input.username);
  const safeNew = sanitizeForHtml(input.newEmail);

  if (input.stage === 'requested') {
    const text = stripIndent`
      Hi ${input.username},

      Someone signed in to your Let's Church account asked to change its email address from this address to ${input.newEmail}.

      Nothing changes unless that address confirms within 7 days. If this was you, there's nothing more to do.

      If it wasn't you, sign in, cancel the change on your profile page, and change your password:

      ${profileUrl}

      In Christ,
      The Let's Church team
    `;
    const html = emailHtml(
      'Email change requested',
      stripIndent`
        <p>Hi <b>${safeName}</b>,</p>

        <p>Someone signed in to your Let's Church account asked to change its email address from this address to <b>${safeNew}</b>.</p>

        <p>Nothing changes unless that address confirms within 7 days. If this was you, there's nothing more to do.</p>

        <p>If it wasn't you, sign in, cancel the change on your profile page, and change your password:</p>

        <p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #3f46c8; border-radius: 6px; color: #ffffff; display: inline-block; font-weight: 600; padding: 12px 20px; text-decoration: none;">Review your profile</a></p>

        <p>In Christ,<br>The Let's Church team</p>
      `,
    ).html;
    return {
      subject: "Someone asked to change your Let's Church email address",
      text,
      html,
    };
  }

  const text = stripIndent`
    Hi ${input.username},

    The email address on your Let's Church account was changed from this address to ${input.newEmail}. You won't get account email here anymore.

    If you didn't make this change, reply to this email and we'll help you get your account back.

    In Christ,
    The Let's Church team
  `;
  const html = emailHtml(
    'Email address changed',
    stripIndent`
      <p>Hi <b>${safeName}</b>,</p>

      <p>The email address on your Let's Church account was changed from this address to <b>${safeNew}</b>. You won't get account email here anymore.</p>

      <p>If you didn't make this change, reply to this email and we'll help you get your account back.</p>

      <p>In Christ,<br>The Let's Church team</p>
    `,
  ).html;
  return {
    subject: "Your Let's Church email address was changed",
    text,
    html,
  };
}

export async function sendEmailChangeNotice(input: {
  stage: EmailChangeNoticeStage;
  appUserId: string;
  username: string;
  oldEmail: string;
  newEmail: string;
}) {
  const email = {
    from: 'hello@lets.church',
    to: input.oldEmail,
    ...generateEmailChangeNotice(input),
  };
  await sendEmail(
    `email-change-notice:${input.stage}:${input.appUserId}:${Date.now()}`,
    { kind: 'encrypted', payload: encryptPayload(JSON.stringify(email)) },
  );
}
