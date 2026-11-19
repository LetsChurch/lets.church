import {
  DONATION_EIN,
  donationNetCents,
  formatDonationAmount,
  isStatementDonationStatus,
} from '@letschurch/util/donations';
import { stripIndent } from 'proper-tags';

import { dashboardPaths, trimTrailingSlash } from './dashboard-links';
import { emailHtml, sanitizeForHtml } from './email';

/**
 * Pure helpers for the January year-end giving statement email. The statement
 * mirrors the printable page at /dashboard/account/donations/<year>: the same
 * statuses count, refunds are netted out, and years are UTC calendar years
 * (see donationStatementYear in the web app).
 */

const RECEIPT_STATEMENT =
  'No goods or services were provided in exchange for these contributions.';

const linkStyle = 'color: #3f46c8; text-decoration: underline;';

export type StatementDonation = {
  amountCents: number;
  refundedAmountCents: number;
  currency: string;
  status: string;
  donatedAt: Date;
};

export type StatementGift = {
  donatedAt: Date;
  amountCents: number;
  currency: string;
};

/** The [start, end) instants of a UTC calendar year. */
export function statementYearRange(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

/**
 * Keep the gifts that belong on a statement, net of refunds, oldest first.
 * Fully refunded gifts drop out.
 */
export function statementGifts(
  donations: ReadonlyArray<StatementDonation>,
): StatementGift[] {
  return donations
    .filter((donation) => isStatementDonationStatus(donation.status))
    .map((donation) => ({
      donatedAt: donation.donatedAt,
      amountCents: donationNetCents(donation),
      currency: donation.currency.toLowerCase(),
    }))
    .filter((gift) => gift.amountCents > 0)
    .sort((a, b) => a.donatedAt.getTime() - b.donatedAt.getTime());
}

/** Totals per currency, in first-seen order. */
export function statementTotals(gifts: ReadonlyArray<StatementGift>) {
  const totals = new Map<string, number>();
  for (const gift of gifts) {
    totals.set(
      gift.currency,
      (totals.get(gift.currency) ?? 0) + gift.amountCents,
    );
  }
  return [...totals].map(([currency, amountCents]) => ({
    currency,
    amountCents,
  }));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

export function buildDonationYearEndStatementEmail(
  {
    year,
    donorName,
    gifts,
  }: {
    year: number;
    donorName: string | null;
    gifts: ReadonlyArray<StatementGift>;
  },
  webUrl: string,
) {
  const statementUrl = `${trimTrailingSlash(webUrl)}${dashboardPaths.accountDonationStatement(year)}`;
  const greeting = donorName?.trim() ? `Dear ${donorName.trim()},` : 'Hello,';
  const total = statementTotals(gifts)
    .map(({ amountCents, currency }) =>
      formatDonationAmount(amountCents, currency),
    )
    .join(' and ');
  const giftCount = gifts.length === 1 ? 'one gift' : `${gifts.length} gifts`;
  const lines = gifts.map(
    (gift) =>
      `${formatDate(gift.donatedAt)}: ${formatDonationAmount(gift.amountCents, gift.currency)}`,
  );
  const summary = `Thank you for supporting Let's Church in ${year}. Your generosity helps keep sermons and Bible teaching free and accessible to everyone. Here is a summary of your giving for your tax records.`;

  // Built from lines rather than stripIndent: interpolating the multi-line gift
  // list into stripIndent would defeat its indent detection.
  const text = [
    greeting,
    '',
    summary,
    '',
    `Total given in ${year}: ${total} (${giftCount})`,
    '',
    ...lines,
    '',
    RECEIPT_STATEMENT,
    `Let's Church Inc. is a tax-exempt organization, EIN ${DONATION_EIN}.`,
    '',
    `You can print or save a full ${year} statement at ${statementUrl} after signing in with this email address.`,
    '',
    'Questions? Write to contact@lets.church.',
    '',
    'In Christ,',
    "The Let's Church team",
  ].join('\n');

  const html = emailHtml(
    `Your ${year} giving statement`,
    stripIndent`
      ${sanitizeForHtml(greeting)}

      ${summary}

      <b>Total given in ${year}:</b> ${sanitizeForHtml(total)} (${giftCount})

      ${lines.map((line) => sanitizeForHtml(line)).join('<br>')}

      ${RECEIPT_STATEMENT}<br>Let's Church Inc. is a tax-exempt organization, EIN ${DONATION_EIN}.

      You can <a href="${sanitizeForHtml(statementUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">print or save a full ${year} statement</a> after signing in with this email address.

      Questions? Write to contact@lets.church.

      In Christ,<br>The Let's Church team
    `,
  ).html;

  return {
    subject: `Your ${year} giving statement from Let's Church`,
    text,
    html,
  };
}
