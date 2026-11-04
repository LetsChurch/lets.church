import { describe, expect, it } from 'vitest';

import { safeErrorMessage } from './safe-error-message';

describe('safeErrorMessage', () => {
  it('drops the parameters of a failed query', () => {
    const error = new Error(
      'Failed query: insert into "donation_donor" values ($1)\nparams: ada@example.com',
      { cause: new Error('deadlock detected') },
    );
    expect(safeErrorMessage(error)).toBe(
      'Database query failed: deadlock detected',
    );
  });

  it('drops the value Postgres quotes back', () => {
    const error = new Error('Failed query: select 1\nparams: x', {
      cause: new Error('invalid input syntax for type uuid: "ada@example.com"'),
    });
    expect(safeErrorMessage(error)).toBe(
      'Database query failed: invalid input syntax for type uuid',
    );
  });

  it('keeps other messages', () => {
    expect(safeErrorMessage(new Error('No such invoice'))).toBe(
      'No such invoice',
    );
    expect(safeErrorMessage('boom')).toBe('boom');
  });
});
