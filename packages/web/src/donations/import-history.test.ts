import { describe, expect, it } from 'vitest';

import {
  MAX_TRANSACTION_CSV_ROWS,
  parseUtcImportDate,
  prepareTransactionHistory,
} from './import-history';

const headers = [
  'Reference #',
  'Status',
  'Amount',
  'Fee Covered',
  'Fee',
  'Donated',
  'Email',
  'First Name',
  'Last Name',
  'Frequency',
  'Currency',
  'Payment captured (UTC)',
  'Refund date (UTC)',
  'Dispute Status',
].join(',');

describe('transaction history import', () => {
  it('prepares successful rows and skips failed rows', () => {
    const csv = [
      headers,
      'ref-1,Succeeded,25.00,1.00,0.85,25.15,JANE@EXAMPLE.COM,Jane,Donor,Monthly,USD,2026-01-03T12:00:00Z,,',
      'ref-2,Failed,10.00,0,0,0,nope@example.com,,,,USD,2026-01-04T12:00:00Z,,',
    ].join('\n');

    const result = prepareTransactionHistory(csv);
    expect(result.rowCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.donations).toEqual([
      expect.objectContaining({
        reference: 'ref-1',
        email: 'jane@example.com',
        name: 'Jane Donor',
        frequency: 'MONTHLY',
        amountCents: 2_600,
        status: 'SUCCEEDED',
      }),
    ]);
  });

  it('rejects a file without stable source references', () => {
    expect(() =>
      prepareTransactionHistory(
        'Status,Amount,Payment captured (UTC)\nSucceeded,10.00,2026-01-03T12:00:00Z',
      ),
    ).toThrow(/Reference #.*Email/s);
  });

  it.each(['Status', 'Amount', 'Email', 'Payment captured (UTC)'])(
    'rejects a file without the %s header',
    (missing) => {
      const keptHeaders = headers
        .split(',')
        .filter((header) => header !== missing)
        .join(',');
      const placeholderRow = keptHeaders
        .split(',')
        .map(() => 'x')
        .join(',');
      expect(() =>
        prepareTransactionHistory(`${keptHeaders}\n${placeholderRow}`),
      ).toThrow(new RegExp(missing.replace(/[()]/g, '\\$&')));
    },
  );

  it('treats timestamps without an offset as UTC', () => {
    expect(parseUtcImportDate('2026-01-03 12:00:00')).toEqual(
      new Date('2026-01-03T12:00:00.000Z'),
    );
    expect(parseUtcImportDate('01/03/2026 12:00:00')).toBeNull();
  });

  it('bounds the number of transaction rows', () => {
    const row =
      'ref-1,Succeeded,25.00,1.00,0.85,25.15,jane@example.com,Jane,Donor,Monthly,USD,2026-01-03T12:00:00Z,,';
    expect(() =>
      prepareTransactionHistory(
        [headers, ...Array(MAX_TRANSACTION_CSV_ROWS + 1).fill(row)].join('\n'),
      ),
    ).toThrow(/20,000 rows/);
  });
});
