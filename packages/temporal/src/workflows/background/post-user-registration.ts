import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const { sendVerificationEmail, subscribeNewsletter } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export type PostUserRegistrationArgs = {
  userId: string;
  username: string;
  email: string;
  subscribeToNewsletter: boolean;
  /** Defaults to 'registration' (welcome wording). */
  verificationKind?: 'registration' | 'email-change';
};

export async function postUserRegistrationWorkflow(
  args: PostUserRegistrationArgs,
) {
  await Promise.all(
    [
      sendVerificationEmail(
        args.userId,
        args.username,
        args.email,
        args.verificationKind ?? 'registration',
      ),
      args.subscribeToNewsletter && subscribeNewsletter(args.email),
    ].filter(Boolean),
  );
}
