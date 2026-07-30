import { emailHtml, sanitizeForHtml } from '@letschurch/temporal/util/email';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';

const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);

export function generateEmailSignInEmail(token: string) {
  const signInUrl = `${WEB_URL}/auth/email-sign-in?${new URLSearchParams({
    token,
  })}`;
  const safeUrl = sanitizeForHtml(signInUrl);

  const text = stripIndent`
    Use this link to sign in to Let's Church:

    ${signInUrl}

    The link expires in 20 minutes and can only be used once.

    If you didn't request it, you can ignore this email.
  `;
  const html = emailHtml(
    "Sign in to Let's Church",
    stripIndent`
      Use <a href="${safeUrl}">this secure link</a> to sign in to Let's Church.

      The link expires in 20 minutes and can only be used once.

      If you didn't request it, you can ignore this email.
    `,
  ).html;

  return { text, html };
}
