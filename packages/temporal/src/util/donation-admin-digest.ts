import { formatDonationAmount } from '@letschurch/util/donations';

import { dashboardPaths, trimTrailingSlash } from './dashboard-links';
import { emailHtml, sanitizeForHtml } from './email';

/**
 * Pure helpers for the daily admin digest of gifts received, which replaces a
 * separate admin email per gift. Times are US Eastern, matching the digest's
 * 8:00 schedule.
 */

export const DIGEST_TIME_ZONE = 'America/New_York';
// Longer digests list this many gifts and point to the dashboard for the rest.
const MAX_LISTED_GIFTS = 100;

const linkStyle = 'color: #3f46c8; text-decoration: underline;';

export type DigestFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export type DigestGift = {
  donatedAt: Date;
  amountCents: number;
  currency: string;
  status: string;
  frequency: DigestFrequency;
  donorName: string | null;
  donorEmail: string | null;
  /** The first payment of a recurring plan. */
  newPlan: boolean;
};

const frequencyWords: Record<DigestFrequency, string> = {
  ONE_TIME: 'one-time',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
};

const statusNotes: Record<string, string> = {
  REFUNDED: 'refunded since',
  PARTIALLY_REFUNDED: 'partly refunded since',
  DISPUTED: 'disputed since',
};

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: DIGEST_TIME_ZONE,
  }).format(date);
}

function formatGiftTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DIGEST_TIME_ZONE,
    timeZoneName: 'short',
  }).format(date);
}

/** "$175.00" or "$175.00 + €20.00": gross gift amounts, per currency. */
function formatTotals(gifts: ReadonlyArray<DigestGift>) {
  const totals = new Map<string, number>();
  for (const gift of gifts) {
    const currency = gift.currency.toLowerCase();
    totals.set(currency, (totals.get(currency) ?? 0) + gift.amountCents);
  }
  return [...totals]
    .map(([currency, cents]) => formatDonationAmount(cents, currency))
    .join(' + ');
}

/** How many recurring plans of each frequency started. */
function newPlanCounts(gifts: ReadonlyArray<DigestGift>) {
  const counts = new Map<DigestFrequency, number>();
  for (const gift of gifts) {
    if (gift.newPlan && gift.frequency !== 'ONE_TIME') {
      counts.set(gift.frequency, (counts.get(gift.frequency) ?? 0) + 1);
    }
  }
  return (['MONTHLY', 'QUARTERLY', 'YEARLY'] as const)
    .filter((frequency) => counts.has(frequency))
    .map((frequency) => ({
      count: counts.get(frequency) ?? 0,
      word: frequencyWords[frequency],
    }));
}

function giftLine(gift: DigestGift) {
  const donor = gift.donorName?.replace(/\s+/g, ' ').trim() || 'Unknown donor';
  const notes = [
    gift.newPlan && gift.frequency !== 'ONE_TIME' ? 'new plan' : null,
    statusNotes[gift.status] ?? null,
  ].filter(Boolean);
  const line = [
    formatGiftTime(gift.donatedAt),
    `${formatDonationAmount(gift.amountCents, gift.currency)} ${frequencyWords[gift.frequency]}`,
    gift.donorEmail ? `${donor} <${gift.donorEmail}>` : donor,
  ].join(' · ');
  return notes.length > 0 ? `${line} (${notes.join(', ')})` : line;
}

/**
 * The digest of gifts that succeeded since the last one. `day` is the day the
 * digest reports on (the day before the 8:00 run), for the subject:
 * "Gifts for Nov 19: 3 gifts, $175.00 (1 new monthly)".
 */
export function buildDonationAdminDigestEmail(
  { day, gifts }: { day: Date; gifts: ReadonlyArray<DigestGift> },
  webUrl: string,
) {
  const sorted = [...gifts].sort(
    (a, b) => a.donatedAt.getTime() - b.donatedAt.getTime(),
  );
  const count = sorted.length === 1 ? '1 gift' : `${sorted.length} gifts`;
  const total = formatTotals(sorted);
  const newPlans = newPlanCounts(sorted);
  const adminUrl = `${trimTrailingSlash(webUrl)}${dashboardPaths.adminDonations()}`;
  const listed = sorted.slice(0, MAX_LISTED_GIFTS).map(giftLine);
  const unlisted = sorted.length - listed.length;

  const summary = `${count} received since the last digest, ${total} in all.`;
  const plans =
    newPlans.length > 0
      ? `New recurring plans: ${newPlans.map(({ count, word }) => `${count} ${word}`).join(', ')}`
      : null;
  const more =
    unlisted > 0 ? `…and ${unlisted} more on the donations dashboard.` : null;

  const text = [
    summary,
    ...(plans ? [plans] : []),
    '',
    ...listed,
    ...(more ? [more] : []),
    '',
    `Manage donations: ${adminUrl}`,
  ].join('\n');

  const html = emailHtml(
    `Gifts for ${formatShortDate(day)}`,
    [
      [summary, plans]
        .filter((line) => line !== null)
        .map((line) => sanitizeForHtml(line))
        .join('<br>'),
      [...listed, ...(more ? [more] : [])]
        .map((line) => sanitizeForHtml(line))
        .join('<br>'),
      `<a href="${sanitizeForHtml(adminUrl)}" target="_blank" rel="noopener noreferrer" style="${linkStyle}">Manage donations</a>`,
    ].join('\n\n'),
  ).html;

  return {
    subject: `Gifts for ${formatShortDate(day)}: ${count}, ${total}${newPlans.length > 0 ? ` (${newPlans.map(({ count, word }) => `${count} new ${word}`).join(', ')})` : ''}`,
    text,
    html,
  };
}
