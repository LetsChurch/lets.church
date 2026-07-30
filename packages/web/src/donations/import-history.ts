import { parse } from 'csv-parse/sync';
import { z } from 'zod';

export type CsvRow = Record<string, string>;
export const MAX_TRANSACTION_CSV_ROWS = 20_000;

export type PreparedImportedDonation = {
  reference: string;
  email: string | null;
  name: string | null;
  frequency: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  status: 'SUCCEEDED' | 'REFUNDED' | 'DISPUTED';
  baseAmountCents: number;
  feeCoverageCents: number;
  amountCents: number;
  processingFeeCents: number;
  netAmountCents: number | null;
  refundedAmountCents: number;
  currency: 'usd';
  disputeStatus: string | null;
  donatedAt: Date;
};

export type PreparedTransactionHistory = {
  rowCount: number;
  skippedCount: number;
  donations: PreparedImportedDonation[];
};

export function parseImportCsv(csv: string) {
  return parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as CsvRow[];
}

function normalizedHeader(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

function hasHeader(row: CsvRow, ...names: string[]) {
  const headers = new Set(Object.keys(row).map(normalizedHeader));
  return names.some((name) => headers.has(normalizedHeader(name)));
}

function value(row: CsvRow, ...names: string[]) {
  const entries = new Map(
    Object.entries(row).map(([key, entryValue]) => [
      normalizedHeader(key),
      entryValue.trim(),
    ]),
  );
  for (const name of names) {
    const entryValue = entries.get(normalizedHeader(name));
    if (entryValue) return entryValue;
  }
  return '';
}

function cents(input: string, description: string) {
  if (!input) return 0;
  const normalized = input.replaceAll(/[$,\s]/g, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${description} has an invalid money value.`);
  }
  const result = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(result)) {
    throw new Error(`${description} has a money value that is too large.`);
  }
  return result;
}

function donationFrequency(input: string) {
  const frequency = input.toLowerCase();
  if (frequency.includes('month')) return 'MONTHLY' as const;
  if (frequency.includes('quarter')) return 'QUARTERLY' as const;
  if (frequency.includes('year') || frequency.includes('annual')) {
    return 'YEARLY' as const;
  }
  return 'ONE_TIME' as const;
}

export function parseUtcImportDate(input: string) {
  const trimmed = input.trim();
  const calendarDate = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) return null;

  let normalized: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}T00:00:00.000Z`;
  } else if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(trimmed)
  ) {
    normalized = `${trimmed.replace(' ', 'T')}Z`;
  } else if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      trimmed,
    )
  ) {
    normalized = trimmed.replace(' ', 'T');
  } else {
    return null;
  }

  const calendarCheck = new Date(`${calendarDate}T12:00:00.000Z`);
  if (
    Number.isNaN(calendarCheck.getTime()) ||
    calendarCheck.toISOString().slice(0, 10) !== calendarDate
  ) {
    return null;
  }
  const result = new Date(normalized);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function prepareTransactionHistory(
  csv: string,
): PreparedTransactionHistory {
  const rows = parseImportCsv(csv);
  if (rows.length === 0) {
    throw new Error('The transaction CSV has no rows.');
  }
  if (rows.length > MAX_TRANSACTION_CSV_ROWS) {
    throw new Error(
      `The transaction CSV cannot contain more than ${MAX_TRANSACTION_CSV_ROWS.toLocaleString()} rows.`,
    );
  }
  const firstRow = rows[0]!;
  const requiredHeaders = [
    {
      label: 'Reference #',
      names: ['Reference #', 'Reference Number'],
    },
    { label: 'Status', names: ['Status'] },
    { label: 'Amount', names: ['Amount'] },
    { label: 'Email', names: ['Email'] },
    {
      label: 'Payment captured (UTC)',
      names: [
        'Payment captured (UTC)',
        'Payment Captured UTC',
        'Transaction date UTC',
        'Transaction Date UTC',
      ],
    },
  ];
  const missingHeaders = requiredHeaders
    .filter(({ names }) => !hasHeader(firstRow, ...names))
    .map(({ label }) => label);
  if (missingHeaders.length > 0) {
    throw new Error(
      `The transaction CSV is missing required columns: ${missingHeaders.join(', ')}.`,
    );
  }

  const donations = rows.flatMap((row, index) => {
    const status = value(row, 'Status').toLowerCase();
    if (!['succeeded', 'authorized'].includes(status)) return [];

    const reference = value(row, 'Reference #', 'Reference Number');
    const description = reference
      ? `Transaction ${reference}`
      : `Transaction row ${index + 2}`;
    const baseAmountCents = cents(value(row, 'Amount'), description);
    if (!reference || baseAmountCents <= 0) {
      throw new Error(`${description} needs a reference and positive amount.`);
    }

    const feeCoverageCents = cents(value(row, 'Fee Covered'), description);
    const processingFeeCents = cents(value(row, 'Fee'), description);
    const netAmount = value(row, 'Donated');
    const netAmountCents = netAmount ? cents(netAmount, description) : null;
    if (
      feeCoverageCents < 0 ||
      processingFeeCents < 0 ||
      (netAmountCents != null && netAmountCents < 0)
    ) {
      throw new Error(`${description} has a negative donation amount or fee.`);
    }
    const emailInput = value(row, 'Email').toLowerCase();
    const emailResult = emailInput ? z.email().safeParse(emailInput) : null;
    if (emailResult && !emailResult.success) {
      throw new Error(`${description} has an invalid email address.`);
    }
    const name = [value(row, 'First Name'), value(row, 'Last Name')]
      .filter(Boolean)
      .join(' ');
    const dateValue = value(
      row,
      'Payment captured (UTC)',
      'Payment Captured UTC',
      'Transaction date UTC',
      'Transaction Date UTC',
    );
    const donatedAt = parseUtcImportDate(dateValue);
    if (!donatedAt) {
      throw new Error(`${description} has an invalid payment date.`);
    }

    const refundDate = value(row, 'Refund date (UTC)', 'Refund date UTC');
    const disputeStatus = value(row, 'Dispute Status') || null;
    const disputed =
      disputeStatus != null &&
      !['won', 'prevented', 'warning_closed'].includes(
        disputeStatus.toLowerCase(),
      );
    const amountCents = baseAmountCents + feeCoverageCents;
    if (amountCents > 5_000_000) {
      throw new Error(`${description} exceeds the donation limit.`);
    }
    const currency = (value(row, 'Currency') || 'USD').toLowerCase();
    if (currency !== 'usd') {
      throw new Error(`${description} uses an unsupported currency.`);
    }

    return [
      {
        reference,
        email: emailResult?.data ?? null,
        name: name || null,
        frequency: donationFrequency(value(row, 'Frequency')),
        status: disputed
          ? ('DISPUTED' as const)
          : refundDate
            ? ('REFUNDED' as const)
            : ('SUCCEEDED' as const),
        baseAmountCents,
        feeCoverageCents,
        amountCents,
        processingFeeCents,
        netAmountCents,
        refundedAmountCents: refundDate ? amountCents : 0,
        currency: 'usd' as const,
        disputeStatus,
        donatedAt,
      },
    ];
  });

  return {
    rowCount: rows.length,
    skippedCount: rows.length - donations.length,
    donations,
  };
}
