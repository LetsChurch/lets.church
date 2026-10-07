import { db, type Donation } from '@letschurch/db';
import { BACKGROUND_QUEUE } from '@letschurch/temporal/queues';
import { staticMeta } from '@letschurch/temporal/util/dashboard-links';
import { emailHtml, sanitizeForHtml } from '@letschurch/temporal/util/email';
import { encryptPayload } from '@letschurch/util/server/encrypted-payload';
import { stripIndent } from 'proper-tags';
import { z } from 'zod';

import { startBackground } from '@/temporal';
import logger from '@/util/logger';
import { safeHttpHref } from '@/util/safe-url';

import { formatDonationAmount } from './amounts';

const moduleLogger = logger.child({
  module: 'donations/notifications',
});

const FROM = 'hello@lets.church';
const RECEIPT_STATEMENT =
  'No goods or services were provided in exchange for this contribution.';

type Frequency = (typeof Donation.$inferSelect)['frequency'];

export type DonationEmailDetails = {
  donationId: string;
  amountCents: number;
  currency: string;
  frequency: Frequency;
  donatedAt: Date;
  receiptUrl: string | null;
  donorName: string | null;
  donorEmail: string | null;
};

const frequencyLabels: Record<Frequency, string> = {
  ONE_TIME: 'One-time',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

const linkStyle = 'color: #3f46c8; text-decoration: underline;';

export function buildDonorThankYouEmail(
  details: DonationEmailDetails,
  webUrl: string,
) {
  const amount = formatDonationAmount(details.amountCents, details.currency);
  const frequency = frequencyLabels[details.frequency];
  const date = formatDate(details.donatedAt);
  const receiptUrl = safeHttpHref(details.receiptUrl);
  const historyUrl = `${webUrl}/dashboard/account/donations`;
  const greeting = details.donorName?.trim()
    ? `Dear ${details.donorName.trim()},`
    : 'Hello,';
  const gift =
    details.frequency === 'ONE_TIME'
      ? 'your gift'
      : `your ${frequency.toLowerCase()} gift`;

  const text = stripIndent`
    ${greeting}

    Thank you for ${gift} to Let's Church. Your support helps keep sermons and Bible teaching free and accessible to everyone.

    Amount: ${amount}
    Frequency: ${frequency}
    Date: ${date}
    ${receiptUrl ? `Receipt: ${receiptUrl}` : ''}

    ${RECEIPT_STATEMENT}
    Let's Church Inc. is a tax-exempt organization, EIN 92-3744006.

    You can view your giving history and annual statements at ${historyUrl} after signing in with this email address.

    In Christ,
    The Let's Church team
  `;

  const html = emailHtml(
    "Thank you for supporting Let's Church",
    stripIndent`
      ${sanitizeForHtml(greeting)}

      Thank you for ${gift} to Let's Church. Your support helps keep sermons and Bible teaching free and accessible to everyone.

      <b>Amount:</b> ${sanitizeForHtml(amount)}<br><b>Frequency:</b> ${frequency}<br><b>Date:</b> ${date}${
        receiptUrl
          ? `<br><b>Receipt:</b> <a href="${sanitizeForHtml(receiptUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">View receipt</a>`
          : ''
      }

      ${RECEIPT_STATEMENT}<br>Let's Church Inc. is a tax-exempt organization, EIN 92-3744006.

      You can view your <a href="${sanitizeForHtml(historyUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">giving history and annual statements</a> after signing in with this email address.

      In Christ,<br>The Let's Church team
    `,
  ).html;

  return {
    subject: "Thank you for supporting Let's Church",
    text,
    html,
  };
}

export function buildAdminDonationEmail(
  details: DonationEmailDetails,
  webUrl: string,
) {
  const amount = formatDonationAmount(details.amountCents, details.currency);
  const frequency = frequencyLabels[details.frequency];
  const date = formatDate(details.donatedAt);
  const donor = details.donorName?.trim() || 'Unknown';
  const donorEmail = details.donorEmail ?? 'None';
  const adminUrl = `${webUrl}/dashboard/admin/donations`;

  const text = stripIndent`
    A donation was received.

    Amount: ${amount}
    Frequency: ${frequency}
    Date: ${date}
    Donor: ${donor}
    Donor email: ${donorEmail}
    Donation ID: ${details.donationId}

    Manage donations: ${adminUrl}
  `;

  const html = emailHtml(
    'New donation received',
    stripIndent`
      A donation was received.

      <b>Amount:</b> ${sanitizeForHtml(amount)}<br><b>Frequency:</b> ${frequency}<br><b>Date:</b> ${date}<br><b>Donor:</b> ${sanitizeForHtml(donor)}<br><b>Donor email:</b> ${sanitizeForHtml(donorEmail)}<br><b>Donation ID:</b> ${sanitizeForHtml(details.donationId)}

      <a href="${sanitizeForHtml(adminUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">Manage donations</a>
    `,
  ).html;

  return {
    subject: `New ${frequency.toLowerCase()} donation: ${amount}`,
    text,
    html,
  };
}

async function loadDonationEmailDetails(
  donationId: string,
): Promise<DonationEmailDetails | null> {
  const donation = await db.query.Donation.findFirst({
    where: (table, { eq }) => eq(table.id, donationId),
  });
  if (!donation) return null;
  const donor = await db.query.DonationDonor.findFirst({
    where: (table, { eq }) => eq(table.id, donation.donorId),
    columns: { name: true, email: true },
  });

  return {
    donationId: donation.id,
    amountCents: donation.amountCents,
    currency: donation.currency,
    frequency: donation.frequency,
    donatedAt: donation.donatedAt,
    receiptUrl: donation.receiptUrl,
    donorName: donor?.name ?? null,
    donorEmail: donor?.email ?? null,
  };
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function isAlreadyStarted(error: unknown) {
  return (
    error instanceof Error &&
    error.name === 'WorkflowExecutionAlreadyStartedError'
  );
}

// Both emails carry donor PII, so the payload is encrypted to keep names and
// addresses out of Temporal workflow history. The workflow id is keyed to the
// donation and duplicates are rejected so a donation is acknowledged once.
async function startDonationEmail(
  workflowId: string,
  summary: string,
  email: { to: string; subject: string; text: string; html: string },
) {
  try {
    await startBackground('sendEmailWorkflow', {
      taskQueue: BACKGROUND_QUEUE,
      ...staticMeta({ summary }),
      workflowId,
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
      retry: { maximumAttempts: 5 },
      args: [
        {
          kind: 'encrypted',
          payload: encryptPayload(JSON.stringify({ from: FROM, ...email })),
        },
      ],
    });
  } catch (error) {
    if (isAlreadyStarted(error)) return;
    throw error;
  }
}

/**
 * Send the donor a thank-you email and notify the site admin about a donation
 * that just succeeded. Failures are logged and swallowed: the ledger is
 * already committed, and Stripe redelivery is deduplicated by event id, so
 * throwing would not cause a retry.
 */
export async function sendDonationNotifications(donationId: string) {
  const { WEB_URL, ADMIN_EMAIL } = z
    .object({ WEB_URL: z.url(), ADMIN_EMAIL: z.email().optional() })
    .parse(process.env);

  let details: DonationEmailDetails | null;
  try {
    details = await loadDonationEmailDetails(donationId);
  } catch (err) {
    moduleLogger.error(
      { err: asError(err), targetId: donationId },
      'Failed to load donation',
    );
    return;
  }
  if (!details) {
    moduleLogger.warn(
      { targetId: donationId },
      'Donation not found for notification',
    );
    return;
  }

  if (details.donorEmail) {
    try {
      await startDonationEmail(
        `donation-thank-you:${donationId}`,
        'Donation thank-you email',
        {
          to: details.donorEmail,
          ...buildDonorThankYouEmail(details, WEB_URL),
        },
      );
    } catch (err) {
      moduleLogger.error(
        { err: asError(err), targetId: donationId },
        'Failed to send thank-you email',
      );
    }
  }

  if (ADMIN_EMAIL) {
    try {
      await startDonationEmail(
        `donation-admin-notice:${donationId}`,
        'Donation admin notification email',
        { to: ADMIN_EMAIL, ...buildAdminDonationEmail(details, WEB_URL) },
      );
    } catch (err) {
      moduleLogger.error(
        { err: asError(err), targetId: donationId },
        'Failed to send admin donation notification',
      );
    }
  }
}
