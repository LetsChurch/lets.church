import { emailHtml, sanitizeForHtml } from '@letschurch/temporal/util/email';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';
import { createPasswordResetJwt } from './jwt';

const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);

export async function generateResetPasswordEmail(
  userId: string,
  username: string,
) {
  // The link carries a signed, purpose-scoped, 15-minute token — never the raw
  // AppUserEmail.key. This keeps the reset credential out of any other flow's
  // URL (e.g. the email-verification link) so it can't be leaked and replayed.
  const token = await createPasswordResetJwt({
    sub: userId,
    purpose: 'password-reset',
  });
  const resetUrl = `${WEB_URL}/auth/reset-password?${new URLSearchParams({
    token,
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
