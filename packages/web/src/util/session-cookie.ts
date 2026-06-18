import { z } from 'zod';
import { SESSION_EXPIRATION_SECONDS } from './jwt';

// Centralized attributes for the `lc-session` SSO cookie so every set/clear site
// stays consistent. The cookie carries the session JWT, so it MUST be:
//   - httpOnly: never readable from JS (defense against session theft via XSS)
//   - secure:   only sent over HTTPS in production (gated on WEB_URL's scheme,
//               so dev over http://localhost still works)
//   - sameSite=lax + path=/: sent on top-level navigations across the site
// Clearing a cookie only works when path/secure/sameSite match what was set, so
// `clearSessionCookieOptions` mirrors these (minus maxAge).
const { WEB_URL } = z.object({ WEB_URL: z.string() }).parse(process.env);

const SECURE = WEB_URL.startsWith('https://');

export const SESSION_COOKIE = 'lc-session';

export const sessionCookieOptions = {
  httpOnly: true,
  secure: SECURE,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_EXPIRATION_SECONDS,
} as const;

export const clearSessionCookieOptions = {
  httpOnly: true,
  secure: SECURE,
  sameSite: 'lax',
  path: '/',
} as const;
