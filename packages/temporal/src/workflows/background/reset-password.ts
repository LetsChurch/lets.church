import { condition, proxyActivities, setHandler } from '@temporalio/workflow';
import { invariant } from 'es-toolkit';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { completeResetPasswordSignal } from '../../refs';

export { completeResetPasswordSignal };

const { sendEmail, updateUser, verifyUserEmail } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 8 },
});

export async function resetPasswordWorkflow(
  userId: string,
  email: string,
  emailText: string,
  emailHtml: string,
) {
  await sendEmail({
    from: 'hello@lets.church',
    to: email,
    subject: "Reset your password for Let's Church",
    text: emailText,
    html: emailHtml,
  });

  let newHash: string | null = null;

  setHandler(completeResetPasswordSignal, (incomingHash) => {
    newHash = incomingHash;
  });

  if (await condition(() => Boolean(newHash), '15 minutes')) {
    invariant(newHash, 'New password hash is required');
    await updateUser(userId, { password: newHash });
    await verifyUserEmail(userId, email);
  }
}
