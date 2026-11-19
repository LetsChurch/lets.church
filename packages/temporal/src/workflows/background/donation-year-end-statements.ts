import {
  ApplicationFailure,
  ChildWorkflowCancellationType,
  continueAsNew,
  executeChild,
  isCancellation,
  log,
  ParentClosePolicy,
  proxyActivities,
  workflowInfo,
} from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import type {
  DonationYearEndStatementCounts,
  DonationYearEndStatementRecipient,
} from '../../activities/background/donation-year-end-statements';
import { BACKGROUND_QUEUE } from '../../queues';

// Retries span about two hours so a database blip on the scheduled day doesn't
// lose the year's run; if they run out, the admin is told to restart it.
const { listDonationYearEndStatementRecipients } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '2 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: {
    maximumAttempts: 10,
    initialInterval: '30 seconds',
    backoffCoefficient: 2,
    maximumInterval: '30 minutes',
  },
});

// Recording runs after a successful send, so it retries until the database is
// back rather than failing the child (which would let a rerun send again). The
// insert can't fail permanently: a donor with gifts can't be deleted.
const { recordDonationYearEndStatement } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  // No maximumAttempts: unlimited (the SDK rejects 0).
  retry: {
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumInterval: '30 minutes',
  },
});

// The timeout outlasts nodemailer's own worst case (2 min to connect, 30 s
// greeting, 10 min of socket silence), so Temporal never retries a send that
// is still in flight and might yet deliver. Backoff spans about 15 minutes so
// provider throttling (421/451) can clear between attempts.
const { sendDonationYearEndStatement } = proxyActivities<typeof activities>({
  startToCloseTimeout: '15 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: {
    maximumAttempts: 5,
    initialInterval: '1 minute',
    backoffCoefficient: 2,
  },
});

const { sendDonationYearEndStatementsAdminSummary } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const CONCURRENCY = 10;
// Recipients per workflow run. Each one adds several history events, so the run
// continues as new after every page to stay far below Temporal's limits.
const PAGE_SIZE = 200;
// Statements go out from January 8 (the schedule's date), after late-December
// bank payments settle. An earlier run would record statements that miss them.
const SEND_FROM_DAY_OF_JANUARY = 8;

export function makeDonationYearEndStatementWorkflowId(
  year: number,
  recipient: DonationYearEndStatementRecipient,
) {
  return `donation-year-end-statement:${year}:${recipient}`;
}

/**
 * Email one recipient (an account or a lone donor record) their statement for
 * `year`, then record the result for the donor records it covered.
 */
export async function donationYearEndStatementWorkflow(params: {
  recipient: DonationYearEndStatementRecipient;
  year: number;
}) {
  const { outcome, donorIds } = await sendDonationYearEndStatement(params);
  if (outcome === 'sent' || outcome === 'undeliverable') {
    await recordDonationYearEndStatement({
      donorIds,
      year: params.year,
      status: outcome === 'sent' ? 'SENT' : 'UNDELIVERABLE',
    });
  }
  return { outcome };
}

export type DonationYearEndStatementsParams = {
  year?: number;
  /** Paging state carried across continue-as-new; not for manual starts. */
  afterRecipient?: string;
  counts?: DonationYearEndStatementCounts;
} | null;

/**
 * The innermost message of a child failure (ChildWorkflowFailure →
 * ActivityFailure → the activity's own error), which is where the reason is.
 * Activity errors are redacted, so it carries no donor details.
 */
function rootCauseMessage(err: unknown) {
  let current: unknown = err;
  while (current instanceof Error && current.cause instanceof Error) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
}

function emptyCounts(): DonationYearEndStatementCounts {
  return {
    sent: 0,
    alreadySent: 0,
    skipped: 0,
    undeliverable: 0,
    inProgress: 0,
    failed: 0,
  };
}

/**
 * Yearly in January: email every donor a summary of last year's gifts, one
 * per account for donors linked to one. Results are recorded per donor record
 * in donation_year_end_statement, so re-running the job (or starting it by
 * hand with `{ year }`) only reaches donors who haven't had one, such as those
 * whose send failed. Addresses the mail server rejected are recorded too, and
 * not retried.
 */
export async function donationYearEndStatementsWorkflow(
  params: DonationYearEndStatementsParams = {},
) {
  const startTime = workflowInfo().startTime;
  // The previous UTC year, matching the statement page's year boundaries.
  const year = params?.year ?? startTime.getUTCFullYear() - 1;
  // Manual starts pass `{ year }` by hand: a string year would turn the range
  // into nonsense ("2026" + 1), and an early run would send statements that
  // miss gifts still settling.
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    startTime.getTime() < Date.UTC(year + 1, 0, SEND_FROM_DAY_OF_JANUARY)
  ) {
    throw ApplicationFailure.nonRetryable(
      `Invalid statement year: ${JSON.stringify(year)}. Statements for a year can be sent from January ${SEND_FROM_DAY_OF_JANUARY} of the next year.`,
    );
  }

  const counts = params?.counts ?? emptyCounts();
  let recipients: DonationYearEndStatementRecipient[];
  try {
    recipients = await listDonationYearEndStatementRecipients({
      year,
      afterRecipient: params?.afterRecipient,
      limit: PAGE_SIZE,
    });
  } catch (err) {
    if (isCancellation(err)) throw err;
    // The schedule won't fire again for a year, so make sure someone hears.
    // If that fails too (say, mail is down as well), keep the original error.
    try {
      await sendDonationYearEndStatementsAdminSummary({
        year,
        counts,
        abortReason: rootCauseMessage(err),
      });
    } catch (notifyErr) {
      if (isCancellation(notifyErr)) throw notifyErr;
      log.error('Could not send the aborted year-end summary', {
        year,
        error: rootCauseMessage(notifyErr),
      });
    }
    throw err;
  }

  async function sendTo(recipient: DonationYearEndStatementRecipient) {
    try {
      const { outcome } = await executeChild(donationYearEndStatementWorkflow, {
        args: [{ recipient, year }],
        workflowId: makeDonationYearEndStatementWorkflowId(year, recipient),
        taskQueue: BACKGROUND_QUEUE,
        // Neither terminating nor cancelling this run may stop a child
        // mid-send; the send is recorded when it finishes either way.
        parentClosePolicy: ParentClosePolicy.ABANDON,
        cancellationType: ChildWorkflowCancellationType.ABANDON,
      });
      if (outcome === 'sent') counts.sent += 1;
      else if (outcome === 'already-sent') counts.alreadySent += 1;
      else if (outcome === 'undeliverable') counts.undeliverable += 1;
      else counts.skipped += 1;
    } catch (err) {
      if (isCancellation(err)) throw err;
      if (
        err instanceof Error &&
        err.name === 'WorkflowExecutionAlreadyStartedError'
      ) {
        counts.inProgress += 1;
        return;
      }
      counts.failed += 1;
      log.warn('Year-end statement failed', {
        recipient,
        year,
        error: rootCauseMessage(err),
      });
    }
  }

  // A rolling pool: each slot takes the next donor as soon as it is free.
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < recipients.length) {
        const recipient = recipients[next];
        next += 1;
        if (recipient) await sendTo(recipient);
      }
    }),
  );

  const lastRecipient = recipients.at(-1);
  if (recipients.length === PAGE_SIZE && lastRecipient) {
    await continueAsNew<typeof donationYearEndStatementsWorkflow>({
      year,
      afterRecipient: lastRecipient,
      counts,
    });
  }

  await sendDonationYearEndStatementsAdminSummary({ year, counts });
  return { year, ...counts };
}
