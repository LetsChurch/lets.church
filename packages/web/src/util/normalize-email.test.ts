import { describe, expect, it } from 'vitest';

import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it('normalizes case and surrounding whitespace for identity lookups', () => {
    expect(normalizeEmail('  Member@Example.COM  ')).toBe('member@example.com');
  });
});
