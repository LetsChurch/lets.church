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
      Use the button below to sign in to Let's Church.

      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #3f46c8; border-radius: 6px; color: #ffffff; display: inline-block; font-weight: 600; padding: 12px 20px; text-decoration: none;">Sign in to Let's Church</a>

      If the button doesn't work, copy and paste this address into your browser:<br><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color: #3f46c8; text-decoration: underline; word-break: break-all;">${safeUrl}</a>

      The link expires in 20 minutes and can only be used once.

      If you didn't request it, you can ignore this email.
    `,
  ).html;

  return { text, html };
}
