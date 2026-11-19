import {
  AppUser,
  AppUserEmail,
  db,
  Donation,
  DonationDonor,
  DonationYearEndStatement,
} from '@letschurch/db';
import { DONATION_STATEMENT_STATUSES } from '@letschurch/util/donations';
import { encryptPayload } from '@letschurch/util/server/encrypted-payload';
import { ApplicationFailure } from '@temporalio/activity';
import {
  and,
  count,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';

import { absoluteWebUrl, dashboardPaths } from '../../util/dashboard-links';
import {
  buildDonationYearEndStatementEmail,
  statementGifts,
  statementYearRange,
} from '../../util/donation-year-end-statement';
import logger from '../../util/logger';
import sendEmail, { validateSendEmailConfig } from './send-email';

const moduleLogger = logger.child({
  module: 'donation-year-end-statements',
});

const FROM = 'hello@lets.church';

function webUrl() {
  return z.object({ WEB_URL: z.url() }).parse(process.env).WEB_URL;
}

/**
 * Who a statement goes to. Donors linked to a live account with a verified
 * email get one statement per account (`user:<appUserId>`), sent to that
 * email and covering every donor record on the account, like the statement
 * page. Other donors get their own (`donor:<donorId>`), sent to the donor
 * record's email. Ids only, so no donor details enter workflow history.
 */
export type DonationYearEndStatementRecipient =
  | `user:${string}`
  | `donor:${string}`;

export type DonationYearEndStatementOutcome =
  | 'sent'
  | 'already-sent'
  | 'skipped'
  | 'undeliverable';

// The donor's account is live and has a verified email to send to.
const donorHasStatementAccount = exists(
  db
    .select({ one: sql`1` })
    .from(AppUserEmail)
    .innerJoin(AppUser, eq(AppUser.id, AppUserEmail.appUserId))
    .where(
      and(
        eq(AppUserEmail.appUserId, DonationDonor.appUserId),
        isNotNull(AppUserEmail.verifiedAt),
        isNull(AppUser.deletedAt),
      ),
    ),
);

/**
 * One page of recipients owed a statement for `year`: they have somewhere to
 * send it and a donor record with at least one gift that counts after refunds
 * and no statement on record. Ordered by recipient; pass the last one back as
 * `afterRecipient` for the next page.
 *
 * Also checks the mail configuration, so a broken deploy fails the run once,
 * up front, rather than every recipient's send.
 */
export async function listDonationYearEndStatementRecipients({
  year,
  afterRecipient,
  limit,
}: {
  year: number;
  afterRecipient?: string;
  limit: number;
}): Promise<DonationYearEndStatementRecipient[]> {
  try {
    webUrl();
    validateSendEmailConfig();
  } catch (err) {
    // Retrying can't fix missing configuration; fail the run now so the
    // admin hears about it today rather than after hours of retries.
    throw ApplicationFailure.nonRetryable(
      `Year-end statements are misconfigured: ${err instanceof Error ? err.message : String(err)}`,
      'Misconfigured',
    );
  }

  const { start, end } = statementYearRange(year);
  const candidates = db
    .select({
      recipient:
        sql<DonationYearEndStatementRecipient>`case when ${donorHasStatementAccount} then 'user:' || ${DonationDonor.appUserId} else 'donor:' || ${DonationDonor.id} end`.as(
          'recipient',
        ),
    })
    .from(Donation)
    .innerJoin(DonationDonor, eq(DonationDonor.id, Donation.donorId))
    .where(
      and(
        or(isNotNull(DonationDonor.email), donorHasStatementAccount),
        inArray(Donation.status, [...DONATION_STATEMENT_STATUSES]),
        gt(Donation.amountCents, Donation.refundedAmountCents),
        gte(Donation.donatedAt, start),
        lt(Donation.donatedAt, end),
        notExists(
          db
            .select({ one: sql`1` })
            .from(DonationYearEndStatement)
            .where(
              and(
                eq(DonationYearEndStatement.donorId, Donation.donorId),
                eq(DonationYearEndStatement.year, year),
              ),
            ),
        ),
      ),
    )
    .as('candidates');
  const rows = await db
    .selectDistinct({ recipient: candidates.recipient })
    .from(candidates)
    .where(
      afterRecipient ? gt(candidates.recipient, afterRecipient) : undefined,
    )
    .orderBy(candidates.recipient)
    .limit(limit);
  return rows.map((row) => row.recipient);
}

const recipientSchema = z.union([
  z.templateLiteral(['user:', z.uuid()]),
  z.templateLiteral(['donor:', z.uuid()]),
]);

/** The address, greeting name, and donor records for a recipient. */
async function resolveRecipient(recipient: DonationYearEndStatementRecipient) {
  const [kind, id] = recipientSchema.parse(recipient).split(':') as [
    'user' | 'donor',
    string,
  ];
  if (kind === 'donor') {
    const donor = await db.query.DonationDonor.findFirst({
      where: (table, { eq }) => eq(table.id, id),
      columns: { id: true, name: true, email: true },
    });
    if (!donor?.email) return null;
    return { email: donor.email, name: donor.name, donors: [donor] };
  }
  const [user, email, donors] = await Promise.all([
    db.query.AppUser.findFirst({
      where: (table, { and, eq, isNull }) =>
        and(eq(table.id, id), isNull(table.deletedAt)),
      columns: { fullName: true },
    }),
    // The same address the donate form prefills: the latest verified one.
    db.query.AppUserEmail.findFirst({
      where: (table, { and, eq, isNotNull }) =>
        and(eq(table.appUserId, id), isNotNull(table.verifiedAt)),
      columns: { email: true },
      orderBy: (table, { desc }) => desc(table.verifiedAt),
    }),
    db.query.DonationDonor.findMany({
      where: (table, { eq }) => eq(table.appUserId, id),
      columns: { id: true, name: true },
      orderBy: (table, { asc }) => asc(table.createdAt),
    }),
  ]);
  if (!user || !email) return null;
  return {
    email: email.email,
    name: user.fullName?.trim() || donors.find((d) => d.name?.trim())?.name,
    donors,
  };
}

/**
 * Email one recipient their giving summary for `year`, unless every donor
 * record it covers already has one on record. Returns the donor records the
 * statement covers, for recording. The email is built and sent inside this
 * activity so names and addresses stay out of Temporal history; the encrypted
 * payload also keeps the address out of sendEmail's logs and errors.
 */
export async function sendDonationYearEndStatement({
  recipient,
  year,
}: {
  recipient: DonationYearEndStatementRecipient;
  year: number;
}): Promise<{
  outcome: DonationYearEndStatementOutcome;
  donorIds: string[];
}> {
  const target = await resolveRecipient(recipient);
  if (!target) {
    moduleLogger.info({ targetId: recipient }, 'No email to send to, skipping');
    return { outcome: 'skipped', donorIds: [] };
  }

  const { start, end } = statementYearRange(year);
  const allDonorIds = target.donors.map((donor) => donor.id);
  const [donations, existing] = await Promise.all([
    db.query.Donation.findMany({
      where: (table, { and, gte, inArray, lt }) =>
        and(
          inArray(table.donorId, allDonorIds),
          gte(table.donatedAt, start),
          lt(table.donatedAt, end),
        ),
      columns: {
        donorId: true,
        amountCents: true,
        refundedAmountCents: true,
        currency: true,
        status: true,
        donatedAt: true,
      },
    }),
    db.query.DonationYearEndStatement.findMany({
      where: (table, { and, eq, inArray }) =>
        and(inArray(table.donorId, allDonorIds), eq(table.year, year)),
      columns: { donorId: true },
    }),
  ]);
  // Donor records with a gift that counts; only these are recorded.
  const donorIds = allDonorIds.filter(
    (donorId) =>
      statementGifts(donations.filter((d) => d.donorId === donorId)).length > 0,
  );
  const gifts = statementGifts(donations);
  if (gifts.length === 0) {
    moduleLogger.info(
      { targetId: recipient },
      'No statement gifts after refunds, skipping',
    );
    return { outcome: 'skipped', donorIds: [] };
  }
  const recorded = new Set(existing.map((row) => row.donorId));
  if (donorIds.every((donorId) => recorded.has(donorId))) {
    return { outcome: 'already-sent', donorIds: [] };
  }

  const email = buildDonationYearEndStatementEmail(
    { year, donorName: target.name ?? null, gifts },
    webUrl(),
  );
  try {
    await sendEmail({
      kind: 'encrypted',
      payload: encryptPayload(
        JSON.stringify({ from: FROM, to: target.email, ...email }),
      ),
    });
  } catch (err) {
    // A bad mailbox won't start working on a retry or a rerun; record it so
    // reruns skip it. Anything else is retried.
    if (
      err instanceof ApplicationFailure &&
      err.type === 'SmtpRecipientRejected'
    ) {
      moduleLogger.warn(
        { targetId: recipient, context: { error: err.message } },
        'Year-end statement address rejected',
      );
      return { outcome: 'undeliverable', donorIds };
    }
    throw err;
  }
  moduleLogger.info({ targetId: recipient }, 'Sent year-end statement');
  return { outcome: 'sent', donorIds };
}

/**
 * Record a statement's result for the donor records it covered. A separate
 * activity from the send, so a database error here is retried on its own and
 * never resends the email.
 */
export async function recordDonationYearEndStatement({
  donorIds,
  year,
  status,
}: {
  donorIds: string[];
  year: number;
  status: 'SENT' | 'UNDELIVERABLE';
}) {
  if (donorIds.length === 0) return;
  await db
    .insert(DonationYearEndStatement)
    .values(donorIds.map((donorId) => ({ donorId, year, status })))
    .onConflictDoNothing();
}

export type DonationYearEndStatementCounts = {
  sent: number;
  alreadySent: number;
  skipped: number;
  undeliverable: number;
  inProgress: number;
  failed: number;
};

/**
 * Tell the site admin how the year-end run went. With `abortReason`, the run
 * stopped early (listing donors failed) and must be started again. The reason
 * is a redacted activity error: configuration or database, never donor data.
 */
export async function sendDonationYearEndStatementsAdminSummary({
  year,
  counts,
  abortReason,
}: {
  year: number;
  counts: DonationYearEndStatementCounts;
  abortReason?: string;
}) {
  const aborted = abortReason !== undefined;
  const { ADMIN_EMAIL } = process.env;
  if (!ADMIN_EMAIL) {
    moduleLogger.warn('ADMIN_EMAIL is not set, skipping year-end summary');
    return;
  }
  // Best effort: the run may be aborting because the database is down.
  const onRecord = await db
    .select({ status: DonationYearEndStatement.status, total: count() })
    .from(DonationYearEndStatement)
    .where(eq(DonationYearEndStatement.year, year))
    .groupBy(DonationYearEndStatement.status)
    .then((rows) => {
      const total = (status: string) =>
        String(rows.find((row) => row.status === status)?.total ?? 0);
      return { sent: total('SENT'), undeliverable: total('UNDELIVERABLE') };
    })
    .catch(() => ({ sent: 'unknown', undeliverable: 'unknown' }));
  const { sent, alreadySent, skipped, undeliverable, inProgress, failed } =
    counts;
  const adminUrl = absoluteWebUrl(dashboardPaths.adminDonations());
  const lines = [
    aborted
      ? `Year-end giving statements for ${year} STOPPED EARLY while listing donors: ${abortReason}. Start donationYearEndStatementsWorkflow with { "year": ${year} } once the problem is fixed; donors already sent a statement are skipped.`
      : `Year-end giving statements for ${year} have been processed. Donors linked to an account get one statement per account.`,
    '',
    `Emails sent this run: ${sent}`,
    `Already sent by an earlier run: ${alreadySent}`,
    `Skipped at send time (email removed or gifts refunded since listing): ${skipped}`,
    `Address rejected by the mail server: ${undeliverable}`,
    `Still running in another run: ${inProgress}`,
    `Failed: ${failed}`,
    `Donor records with a statement on record for ${year}: ${onRecord.sent} sent, ${onRecord.undeliverable} undeliverable`,
  ];
  if (undeliverable > 0) {
    lines.push(
      '',
      `Rejected addresses are recorded and skipped by reruns. To try one again after fixing the address, delete its donation_year_end_statement row (status UNDELIVERABLE, year ${year}) and rerun.`,
    );
  }
  if (failed > 0 || inProgress > 0) {
    lines.push(
      '',
      `Failed or still-running statements are listed in Temporal under workflow ids starting with donation-year-end-statement:${year}: and the worker logs. Start donationYearEndStatementsWorkflow with { "year": ${year} } once they finish to retry any that failed; donors already sent a statement are skipped.`,
    );
  }
  if (adminUrl) lines.push('', `Manage donations: ${adminUrl}`);

  await sendEmail({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `${year} year-end giving statements${aborted ? ' STOPPED EARLY' : ''}: ${sent} sent${failed > 0 ? `, ${failed} failed` : ''}`,
    text: lines.join('\n'),
  });
}
