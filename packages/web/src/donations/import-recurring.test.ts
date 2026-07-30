import { describe, expect, it } from 'vitest';

import {
  MAX_RECURRING_PLAN_CSV_ROWS,
  prepareRecurringMigration,
  stripeRecurringInterval,
} from './import-recurring';

const now = new Date('2026-07-24T12:00:00.000Z');

function validInput() {
  return {
    now,
    planRows: [
      {
        ID: 'plan_123',
        Status: 'Active',
        Frequency: 'Quarterly',
        'First Name': 'Jane',
        'Last Name': 'Donor',
        Email: '  JANE@example.com  ',
        Amount: '100.00',
        Fee_covered: '3.30',
        Currency: 'USD',
        Next_bill_date: '2026-10-01',
      },
    ],
    mappingRows: [
      {
        customer_id_old: 'cus_old',
        source_id_old: 'card_old',
        customer_id_new: 'cus_new',
        source_id_new: 'card_new',
      },
    ],
    linkRows: [
      {
        'Source Plan ID': 'plan_123',
        'Stripe Customer ID': 'cus_old',
        'Stripe Source ID': 'card_old',
      },
    ],
  };
}

describe('recurring plan import', () => {
  it('prepares an active plan and preserves covered fees', () => {
    const result = prepareRecurringMigration(validInput());

    expect(result.skippedInactive).toBe(0);
    expect(result.plans).toEqual([
      {
        sourcePlanId: 'plan_123',
        name: 'Jane Donor',
        email: 'jane@example.com',
        frequency: 'QUARTERLY',
        baseAmountCents: 10_000,
        feeCoverageCents: 330,
        amountCents: 10_330,
        currency: 'usd',
        nextBillAt: new Date('2026-10-01T12:00:00.000Z'),
        sourceCustomerId: 'cus_old',
        sourcePaymentSourceId: 'card_old',
        destinationCustomerId: 'cus_new',
        destinationPaymentSourceId: 'card_new',
      },
    ]);
  });

  it('skips inactive plans', () => {
    const input = validInput();
    input.planRows[0]!.Status = 'Canceled';
    const result = prepareRecurringMigration(input);
    expect(result.skippedInactive).toBe(1);
    expect(result.plans).toEqual([]);
  });

  it('rejects billing dates less than 48 hours away', () => {
    const input = validInput();
    input.planRows[0]!.Next_bill_date = '2026-07-26T11:59:59Z';

    expect(() => prepareRecurringMigration(input)).toThrow(
      /less than 48 hours away/,
    );
  });

  it('rejects a nonexistent calendar date', () => {
    const input = validInput();
    input.planRows[0]!.Next_bill_date = '2026-09-31';

    expect(() => prepareRecurringMigration(input)).toThrow(
      /invalid Next_bill_date/,
    );
  });

  it('rejects an invalid ISO calendar date without throwing a RangeError', () => {
    const input = validInput();
    input.planRows[0]!.Next_bill_date = '2026-13-01T12:00:00Z';

    expect(() => prepareRecurringMigration(input)).toThrow(
      /invalid Next_bill_date/,
    );
  });

  it('rejects a plan whose copied source mapping is missing', () => {
    const input = validInput();
    input.mappingRows[0]!.source_id_old = 'card_other';

    expect(() => prepareRecurringMigration(input)).toThrow(
      /no matching Stripe copy mapping/,
    );
  });

  it('maps each supported frequency to a Stripe interval', () => {
    expect(stripeRecurringInterval('MONTHLY')).toEqual({
      interval: 'month',
      interval_count: 1,
    });
    expect(stripeRecurringInterval('QUARTERLY')).toEqual({
      interval: 'month',
      interval_count: 3,
    });
    expect(stripeRecurringInterval('YEARLY')).toEqual({
      interval: 'year',
      interval_count: 1,
    });
  });

  it('bounds the number of recurring-plan rows', () => {
    const input = validInput();
    input.planRows = Array(MAX_RECURRING_PLAN_CSV_ROWS + 1).fill(
      input.planRows[0]!,
    );
    expect(() => prepareRecurringMigration(input)).toThrow(/5,000 rows/);
  });
});
