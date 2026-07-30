import { describe, expect, it } from 'vitest';

import { redactLogInput } from './redact-log-input';

describe('redactLogInput', () => {
  it('redacts credentials, personal data, and import contents recursively', () => {
    expect(
      redactLogInput({
        email: 'donor@example.com',
        password: 'not-for-logs',
        nested: {
          token: 'one-time-token',
          plansCsv: 'private donor data',
        },
      }),
    ).toEqual({
      email: '[REDACTED]',
      password: '[REDACTED]',
      nested: {
        token: '[REDACTED]',
        plansCsv: '[REDACTED]',
      },
    });
  });
});
