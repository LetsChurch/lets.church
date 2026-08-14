import { encryptPayload } from '@letschurch/util/server/encrypted-payload';

import { sendEmail } from '@/temporal';

import { issueAuthToken, PASSWORD_RESET_TTL_MINUTES } from './auth-token';
import { generateResetPasswordEmail } from './reset-password-email';

export async function sendPasswordResetEmail(input: {
  userId: string;
  username: string;
  email: string;
}) {
  const issued = await issueAuthToken({
    type: 'PASSWORD_RESET',
    email: input.email,
    appUserId: input.userId,
    ttlMinutes: PASSWORD_RESET_TTL_MINUTES,
  });
  const email = {
    from: 'hello@lets.church',
    to: input.email,
    subject: "Reset your password for Let's Church",
    ...generateResetPasswordEmail(issued.token, input.username),
  };

  await sendEmail(`password-reset:${issued.id}`, {
    kind: 'encrypted',
    payload: encryptPayload(JSON.stringify(email)),
  });
}
