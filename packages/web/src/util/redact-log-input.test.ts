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
          csv: 'private media import data',
        },
      }),
    ).toEqual({
      email: '[REDACTED]',
      password: '[REDACTED]',
      nested: {
        token: '[REDACTED]',
        plansCsv: '[REDACTED]',
        csv: '[REDACTED]',
      },
    });
  });

  it('redacts stream keys regardless of nesting or key casing', () => {
    expect(
      redactLogInput({
        streamKey: 'dummy-top-level-stream-key',
        label: 'Primary destination',
        targets: [
          {
            streamKey: 'dummy-nested-stream-key',
            url: 'rtmps://example.test/live',
          },
          {
            StReAmKeY: 'dummy-mixed-case-stream-key',
            label: 'Backup destination',
          },
        ],
      }),
    ).toEqual({
      streamKey: '[REDACTED]',
      label: 'Primary destination',
      targets: [
        {
          streamKey: '[REDACTED]',
          url: 'rtmps://example.test/live',
        },
        {
          StReAmKeY: '[REDACTED]',
          label: 'Backup destination',
        },
      ],
    });
  });
});
