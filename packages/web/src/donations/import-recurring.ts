import { z } from 'zod';

export type CsvRow = Record<string, string>;
export const MAX_RECURRING_PLAN_CSV_ROWS = 5_000;
export const MAX_RECURRING_SUPPORT_CSV_ROWS = 10_000;

export type RecurringFrequency = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export type PreparedRecurringPlan = {
  sourcePlanId: string;
  name: string | null;
  email: string;
  frequency: RecurringFrequency;
  baseAmountCents: number;
  feeCoverageCents: number;
  amountCents: number;
  currency: 'usd';
  nextBillAt: Date;
  sourceCustomerId: string;
  sourcePaymentSourceId: string;
  destinationCustomerId: string;
  destinationPaymentSourceId: string;
};

export type RecurringMigrationPlan = {
  plans: PreparedRecurringPlan[];
  skippedInactive: number;
};

const MINIMUM_BILLING_LEAD_MS = 48 * 60 * 60 * 1000;
const MAXIMUM_BILLING_LEAD_MS = 370 * 24 * 60 * 60 * 1000;

function normalizedHeader(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

function rowValues(row: CsvRow) {
  return new Map(
    Object.entries(row).map(([key, entryValue]) => [
      normalizedHeader(key),
      entryValue.trim(),
    ]),
  );
}

function value(row: CsvRow, ...names: string[]) {
  const entries = rowValues(row);
  for (const name of names) {
    const entryValue = entries.get(normalizedHeader(name));
    if (entryValue) return entryValue;
  }
  return '';
}

function requiredValue(
  row: CsvRow,
  rowDescription: string,
  ...names: string[]
) {
  const result = value(row, ...names);
  if (!result) {
    throw new Error(
      `${rowDescription} is missing ${names[0] ?? 'a required value'}.`,
    );
  }
  return result;
}

function cents(input: string, rowDescription: string, field: string) {
  const normalized = input.replaceAll(/[$,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${rowDescription} has an invalid ${field}.`);
  }

  const [dollars, decimal = ''] = normalized.split('.');
  const result = Number(dollars) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) {
    throw new Error(`${rowDescription} has an ${field} that is too large.`);
  }
  return result;
}

function frequency(input: string, rowDescription: string) {
  switch (input.trim().toLowerCase()) {
    case 'monthly':
      return 'MONTHLY' as const;
    case 'quarterly':
      return 'QUARTERLY' as const;
    case 'yearly':
    case 'annually':
    case 'annual':
      return 'YEARLY' as const;
    default:
      throw new Error(`${rowDescription} has an unsupported frequency.`);
  }
}

function nextBillDate(input: string, rowDescription: string, now: Date) {
  let result: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    result = new Date(`${input}T12:00:00.000Z`);
    if (
      Number.isNaN(result.getTime()) ||
      result.toISOString().slice(0, 10) !== input
    ) {
      throw new Error(`${rowDescription} has an invalid Next_bill_date.`);
    }
  } else if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      input,
    )
  ) {
    const calendarDate = input.slice(0, 10);
    const calendarCheck = new Date(`${calendarDate}T12:00:00.000Z`);
    if (
      Number.isNaN(calendarCheck.getTime()) ||
      calendarCheck.toISOString().slice(0, 10) !== calendarDate
    ) {
      throw new Error(`${rowDescription} has an invalid Next_bill_date.`);
    }
    result = new Date(input);
  } else {
    throw new Error(
      `${rowDescription} has an invalid Next_bill_date; use YYYY-MM-DD or an ISO timestamp with a time zone.`,
    );
  }

  if (Number.isNaN(result.getTime())) {
    throw new Error(`${rowDescription} has an invalid Next_bill_date.`);
  }

  const leadTime = result.getTime() - now.getTime();
  if (leadTime < MINIMUM_BILLING_LEAD_MS) {
    throw new Error(
      `${rowDescription} has a Next_bill_date less than 48 hours away.`,
    );
  }
  if (leadTime > MAXIMUM_BILLING_LEAD_MS) {
    throw new Error(
      `${rowDescription} has a Next_bill_date more than 370 days away.`,
    );
  }

  return result;
}

function migrationKey(customerId: string, paymentSourceId: string) {
  return `${customerId}\u0000${paymentSourceId}`;
}

function assertCustomerId(value: string, rowDescription: string) {
  if (!/^cus_[A-Za-z0-9]+$/.test(value)) {
    throw new Error(`${rowDescription} has an invalid Stripe customer ID.`);
  }
}

function assertPaymentSourceId(value: string, rowDescription: string) {
  if (!/^(?:pm|card|src|ba)_[A-Za-z0-9]+$/.test(value)) {
    throw new Error(
      `${rowDescription} has an unsupported Stripe payment source ID.`,
    );
  }
}

export function prepareRecurringMigration(input: {
  planRows: CsvRow[];
  mappingRows: CsvRow[];
  linkRows: CsvRow[];
  now?: Date;
}): RecurringMigrationPlan {
  const now = input.now ?? new Date();
  if (input.planRows.length === 0) {
    throw new Error('The recurring-plan CSV is empty.');
  }
  if (input.mappingRows.length === 0) {
    throw new Error('The Stripe copy mapping is empty.');
  }
  if (input.linkRows.length === 0) {
    throw new Error('The plan-to-source link file is empty.');
  }
  if (input.planRows.length > MAX_RECURRING_PLAN_CSV_ROWS) {
    throw new Error(
      `The recurring-plan CSV cannot contain more than ${MAX_RECURRING_PLAN_CSV_ROWS.toLocaleString()} rows.`,
    );
  }
  if (
    input.mappingRows.length > MAX_RECURRING_SUPPORT_CSV_ROWS ||
    input.linkRows.length > MAX_RECURRING_SUPPORT_CSV_ROWS
  ) {
    throw new Error(
      `Stripe mapping and plan-link CSVs cannot contain more than ${MAX_RECURRING_SUPPORT_CSV_ROWS.toLocaleString()} rows each.`,
    );
  }

  const mappings = new Map<
    string,
    { destinationCustomerId: string; destinationPaymentSourceId: string }
  >();
  for (const [index, row] of input.mappingRows.entries()) {
    const rowDescription = `Stripe mapping row ${index + 2}`;
    const sourceCustomerId = requiredValue(
      row,
      rowDescription,
      'customer_id_old',
    );
    const sourcePaymentSourceId = requiredValue(
      row,
      rowDescription,
      'source_id_old',
    );
    const destinationCustomerId = requiredValue(
      row,
      rowDescription,
      'customer_id_new',
    );
    const destinationPaymentSourceId = requiredValue(
      row,
      rowDescription,
      'source_id_new',
    );
    assertCustomerId(sourceCustomerId, rowDescription);
    assertCustomerId(destinationCustomerId, rowDescription);
    assertPaymentSourceId(sourcePaymentSourceId, rowDescription);
    assertPaymentSourceId(destinationPaymentSourceId, rowDescription);

    const key = migrationKey(sourceCustomerId, sourcePaymentSourceId);
    if (mappings.has(key)) {
      throw new Error(
        `${rowDescription} duplicates an earlier Stripe mapping.`,
      );
    }
    mappings.set(key, {
      destinationCustomerId,
      destinationPaymentSourceId,
    });
  }

  const links = new Map<
    string,
    { sourceCustomerId: string; sourcePaymentSourceId: string }
  >();
  for (const [index, row] of input.linkRows.entries()) {
    const rowDescription = `Plan link row ${index + 2}`;
    const planId = requiredValue(
      row,
      rowDescription,
      'Source Plan ID',
      'Plan ID',
    );
    const sourceCustomerId = requiredValue(
      row,
      rowDescription,
      'Stripe Customer ID',
      'customer_id_old',
    );
    const sourcePaymentSourceId = requiredValue(
      row,
      rowDescription,
      'Stripe Source ID',
      'source_id_old',
    );
    assertCustomerId(sourceCustomerId, rowDescription);
    assertPaymentSourceId(sourcePaymentSourceId, rowDescription);

    if (links.has(planId)) {
      throw new Error(`${rowDescription} duplicates source plan ${planId}.`);
    }
    links.set(planId, { sourceCustomerId, sourcePaymentSourceId });
  }

  const seenPlans = new Set<string>();
  const emailCustomers = new Map<string, string>();
  const customerEmails = new Map<string, string>();
  const plans: PreparedRecurringPlan[] = [];
  let skippedInactive = 0;

  for (const [index, row] of input.planRows.entries()) {
    const fallbackDescription = `Recurring plan row ${index + 2}`;
    const planId = requiredValue(row, fallbackDescription, 'ID');
    const rowDescription = `Recurring plan ${planId}`;
    const hasControlCharacter = [...planId].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    });
    if (planId.length > 150 || hasControlCharacter) {
      throw new Error(`${fallbackDescription} has an invalid ID.`);
    }
    if (seenPlans.has(planId)) {
      throw new Error(`${rowDescription} appears more than once.`);
    }
    seenPlans.add(planId);

    if (
      requiredValue(row, rowDescription, 'Status').toLowerCase() !== 'active'
    ) {
      skippedInactive += 1;
      continue;
    }

    const link = links.get(planId);
    if (!link) {
      throw new Error(`${rowDescription} has no plan-to-source link.`);
    }
    const mapping = mappings.get(
      migrationKey(link.sourceCustomerId, link.sourcePaymentSourceId),
    );
    if (!mapping) {
      throw new Error(`${rowDescription} has no matching Stripe copy mapping.`);
    }

    const emailInput = requiredValue(
      row,
      rowDescription,
      'Email',
    ).toLowerCase();
    const parsedEmail = z.email().safeParse(emailInput);
    if (!parsedEmail.success) {
      throw new Error(`${rowDescription} has an invalid email address.`);
    }
    const email = parsedEmail.data;

    const existingCustomer = emailCustomers.get(email);
    if (
      existingCustomer &&
      existingCustomer !== mapping.destinationCustomerId
    ) {
      throw new Error(
        `${rowDescription} maps one email address to multiple Stripe customers.`,
      );
    }
    const existingEmail = customerEmails.get(mapping.destinationCustomerId);
    if (existingEmail && existingEmail !== email) {
      throw new Error(
        `${rowDescription} maps one Stripe customer to multiple email addresses.`,
      );
    }
    emailCustomers.set(email, mapping.destinationCustomerId);
    customerEmails.set(mapping.destinationCustomerId, email);

    const baseAmountCents = cents(
      requiredValue(row, rowDescription, 'Amount'),
      rowDescription,
      'Amount',
    );
    if (baseAmountCents <= 0) {
      throw new Error(`${rowDescription} does not have a positive Amount.`);
    }
    const feeInput = value(row, 'Fee_covered', 'Fee Covered') || '0';
    const feeCoverageCents = cents(feeInput, rowDescription, 'Fee_covered');
    const amountCents = baseAmountCents + feeCoverageCents;
    if (amountCents > 5_000_000) {
      throw new Error(`${rowDescription} exceeds the donation limit.`);
    }

    const currency = (value(row, 'Currency') || 'USD').toLowerCase();
    if (currency !== 'usd') {
      throw new Error(`${rowDescription} uses an unsupported currency.`);
    }
    const name = [value(row, 'First Name'), value(row, 'Last Name')]
      .filter(Boolean)
      .join(' ');

    plans.push({
      sourcePlanId: planId,
      name: name || null,
      email,
      frequency: frequency(
        requiredValue(row, rowDescription, 'Frequency'),
        rowDescription,
      ),
      baseAmountCents,
      feeCoverageCents,
      amountCents,
      currency,
      nextBillAt: nextBillDate(
        requiredValue(row, rowDescription, 'Next_bill_date', 'Next Bill Date'),
        rowDescription,
        now,
      ),
      sourceCustomerId: link.sourceCustomerId,
      sourcePaymentSourceId: link.sourcePaymentSourceId,
      destinationCustomerId: mapping.destinationCustomerId,
      destinationPaymentSourceId: mapping.destinationPaymentSourceId,
    });
  }

  for (const linkedPlanId of links.keys()) {
    if (!seenPlans.has(linkedPlanId)) {
      throw new Error(
        `Plan link ${linkedPlanId} does not exist in the recurring-plan CSV.`,
      );
    }
  }

  return { plans, skippedInactive };
}

export function stripeRecurringInterval(frequency: RecurringFrequency) {
  if (frequency === 'MONTHLY') {
    return { interval: 'month' as const, interval_count: 1 };
  }
  if (frequency === 'QUARTERLY') {
    return { interval: 'month' as const, interval_count: 3 };
  }
  return { interval: 'year' as const, interval_count: 1 };
}
