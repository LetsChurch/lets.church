import { sendEmail } from '@/temporal';

import { EMAIL_SIGN_IN_TTL_MINUTES, issueAuthToken } from './auth-token';
import { generateEmailSignInEmail } from './email-sign-in-email';

export async function sendEmailSignInLink(input: {
  email: string;
  appUserId?: string | null;
  returnTo?: string | null;
}) {
  const issued = await issueAuthToken({
    type: 'EMAIL_SIGN_IN',
    email: input.email,
    appUserId: input.appUserId,
    returnTo: input.returnTo,
    ttlMinutes: EMAIL_SIGN_IN_TTL_MINUTES,
    // Issuing another email must not let a third party invalidate a link the
    // recipient already requested. The first completed link consumes its peers.
    replaceExisting: false,
  });
  const { text, html } = generateEmailSignInEmail(issued.token);

  await sendEmail(`email-sign-in:${issued.id}`, {
    from: 'hello@lets.church',
    to: input.email,
    subject: "Your secure sign-in link for Let's Church",
    text,
    html,
  });
}
