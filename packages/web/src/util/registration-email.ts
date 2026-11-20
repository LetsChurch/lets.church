import { emailHtml, sanitizeForHtml } from '@letschurch/temporal/util/email';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';

const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);

const buttonStyle =
  'background-color: #3f46c8; border-radius: 6px; color: #ffffff; display: inline-block; font-weight: 600; padding: 12px 20px; text-decoration: none;';
const linkStyle =
  'color: #3f46c8; text-decoration: underline; word-break: break-all;';

// Sent when the address is new to Let's Church: the account is created only
// when this link is used, so it's the inbox owner who creates it.
export function generateFinishRegistrationEmail(input: {
  token: string;
  username: string;
}) {
  const url = `${WEB_URL}/auth/finish-registration?${new URLSearchParams({
    token: input.token,
  })}`;
  const safeUrl = sanitizeForHtml(url);
  const safeName = sanitizeForHtml(input.username);

  const text = stripIndent`
    Welcome to Let's Church, ${input.username}!

    Use this link to finish creating your account:

    ${url}

    The link works for 24 hours. If you didn't sign up, ignore this email and no account will be created.

    In Christ,
    The Let's Church team
  `;
  const html = emailHtml(
    'Finish creating your account',
    stripIndent`
      <p>Welcome to Let's Church, <b>${safeName}</b>!</p>

      <p>Use the button below to finish creating your account.</p>

      <p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="${buttonStyle}">Finish creating my account</a></p>

      <p>If the button doesn't work, copy and paste this address into your browser:<br><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${safeUrl}</a></p>

      <p>The link works for 24 hours. If you didn't sign up, ignore this email and no account will be created.</p>

      <p>In Christ,<br>The Let's Church team</p>
    `,
  ).html;

  return {
    subject: "Finish creating your Let's Church account",
    text,
    html,
  };
}

// Sent instead when the address already has an account. The person who
// submitted the form sees the same "check your email" page either way, so
// registration can't be used to find out which addresses are registered;
// only the inbox owner learns the address is taken.
export function generateAccountExistsEmail() {
  const loginUrl = `${WEB_URL}/auth/login`;
  const signInUrl = `${WEB_URL}/auth/email-sign-in`;
  const resetUrl = `${WEB_URL}/auth/forgot-password`;

  const text = stripIndent`
    Someone tried to create a Let's Church account with this email address, but you already have one.

    Sign in: ${loginUrl}
    Get a sign-in link by email: ${signInUrl}
    Forgot your password? Reset it: ${resetUrl}

    If you didn't try to sign up, ignore this email. Nothing has changed.

    In Christ,
    The Let's Church team
  `;
  const html = emailHtml(
    'You already have an account',
    stripIndent`
      <p>Someone tried to create a Let's Church account with this email address, but you already have one.</p>

      <p><a href="${sanitizeForHtml(loginUrl)}" target="_blank" rel="noopener noreferrer" style="${buttonStyle}">Sign in</a></p>

      <p>No password, or forgot it? <a href="${sanitizeForHtml(signInUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">Get a sign-in link by email</a> or <a href="${sanitizeForHtml(resetUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">reset your password</a>.</p>

      <p>If you didn't try to sign up, ignore this email. Nothing has changed.</p>

      <p>In Christ,<br>The Let's Church team</p>
    `,
  ).html;

  return {
    subject: "You already have a Let's Church account",
    text,
    html,
  };
}
