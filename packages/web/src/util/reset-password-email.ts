import { emailHtml, sanitizeForHtml } from '@letschurch/temporal/util/email';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';
import { uuidTranslator } from './uuid';

const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);

export function generateResetPasswordEmail(
  userId: string,
  username: string,
  emailKey: string,
) {
  const resetUrl = `${WEB_URL}/auth/reset-password?${new URLSearchParams({
    userId: uuidTranslator.fromUUID(userId),
    key: uuidTranslator.fromUUID(emailKey),
  })}`;

  const text = stripIndent`
    Hello ${username},

    We received a request to reset your password for Let's Church. If you made this request, click the link below to reset your password:

    ${resetUrl}

    This link will expire in 15 minutes.

    If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
  `;

  const html = emailHtml(
    'Reset your password',
    stripIndent`
      Hello <b>${sanitizeForHtml(username)}</b>,

      We received a request to reset your password for Let's Church. If you made this request, click <a href="${resetUrl}">here</a> to reset your password.

      This link will expire in 15 minutes.

      Alternatively, visit the following link: ${resetUrl}

      If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
    `,
  ).html;

  return { text, html };
}
