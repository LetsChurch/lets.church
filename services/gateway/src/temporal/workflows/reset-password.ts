import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import invariant from 'tiny-invariant';
import type * as activities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';

const { sendEmail, updateUser } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 8 },
});

export const completeResetPasswordSignal = defineSignal<[string]>(
  'completeResetPassword',
);

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

  setHandler(
    completeResetPasswordSignal,
    (incomingHash) => void (newHash = incomingHash),
  );

  if (await condition(() => Boolean(newHash), '15 minutes')) {
    invariant(newHash);
    await updateUser(userId, { password: newHash });
  }
}
