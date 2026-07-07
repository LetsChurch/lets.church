import short from 'short-uuid';
import { describe, expect, test } from 'vitest';

import { IncomingIdSchema, OutgoingIdSchema } from './common';

const idTranslator = short(short.constants.flickrBase58);

describe('IdSchema', () => {
  describe('valid UUIDs', () => {
    test('accepts standard UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = IncomingIdSchema.safeParse(uuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(uuid.toLowerCase());
      }
    });

    test('converts UUID with uppercase letters to lowercase', () => {
      const uuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = IncomingIdSchema.safeParse(uuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(uuid.toLowerCase());
      }
    });

    test('accepts randomly generated UUID', () => {
      const uuid = crypto.randomUUID();
      const result = IncomingIdSchema.safeParse(uuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(uuid.toLowerCase());
      }
    });

    test('accepts multiple different UUIDs', () => {
      const uuids = [
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ];

      for (const uuid of uuids) {
        const result = IncomingIdSchema.safeParse(uuid);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(uuid.toLowerCase());
        }
      }
    });
  });

  describe('valid base58 IDs', () => {
    test('accepts valid base58 string and converts to lowercase UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const base58 = idTranslator.fromUUID(uuid);
      const result = IncomingIdSchema.safeParse(base58);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(uuid.toLowerCase());
      }
    });

    test('transforms base58 to lowercase UUID format', () => {
      const originalUuid = crypto.randomUUID();
      const base58 = idTranslator.fromUUID(originalUuid);
      const result = IncomingIdSchema.safeParse(base58);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(originalUuid.toLowerCase());
      }
    });

    test('accepts multiple different base58 IDs', () => {
      const uuids = [
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ];

      for (const uuid of uuids) {
        const base58 = idTranslator.fromUUID(uuid);
        const result = IncomingIdSchema.safeParse(base58);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(uuid.toLowerCase());
        }
      }
    });

    test('validates base58 format correctly', () => {
      const validBase58 = idTranslator.fromUUID(crypto.randomUUID());
      expect(idTranslator.validate(validBase58)).toBe(true);

      const result = IncomingIdSchema.safeParse(validBase58);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid IDs', () => {
    test('rejects empty string', () => {
      const result = IncomingIdSchema.safeParse('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects invalid UUID format', () => {
      const result = IncomingIdSchema.safeParse('not-a-valid-uuid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects UUID with invalid characters', () => {
      const result = IncomingIdSchema.safeParse(
        '550e8400-e29b-41d4-a716-44665544000g',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects UUID with wrong length', () => {
      const result = IncomingIdSchema.safeParse(
        '550e8400-e29b-41d4-a716-4466554400',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects invalid base58 string', () => {
      const result = IncomingIdSchema.safeParse('invalid-base58-string!@#');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects number', () => {
      const result = IncomingIdSchema.safeParse(12345);
      expect(result.success).toBe(false);
    });

    test('rejects null', () => {
      const result = IncomingIdSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    test('rejects undefined', () => {
      const result = IncomingIdSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    test('rejects object', () => {
      const result = IncomingIdSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    test('rejects array', () => {
      const result = IncomingIdSchema.safeParse([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('nil UUID (all zeros)', () => {
      const nilUuid = '00000000-0000-0000-0000-000000000000';
      const result = IncomingIdSchema.safeParse(nilUuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(nilUuid.toLowerCase());
      }
    });

    test('base58 representation of nil UUID', () => {
      const nilUuid = '00000000-0000-0000-0000-000000000000';
      const base58 = idTranslator.fromUUID(nilUuid);
      const result = IncomingIdSchema.safeParse(base58);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(nilUuid.toLowerCase());
      }
    });

    test('UUID without hyphens is rejected', () => {
      const result = IncomingIdSchema.safeParse(
        '550e8400e29b41d4a716446655440000',
      );
      expect(result.success).toBe(false);
    });

    test('converts mixed case UUID to lowercase', () => {
      const mixedCaseUuid = '550e8400-E29B-41d4-A716-446655440000';
      const result = IncomingIdSchema.safeParse(mixedCaseUuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(mixedCaseUuid.toLowerCase());
      }
    });
  });

  describe('round-trip conversion', () => {
    test('UUID -> base58 -> UUID maintains consistency (lowercase)', () => {
      const originalUuid = crypto.randomUUID();
      const base58 = idTranslator.fromUUID(originalUuid);
      const result = IncomingIdSchema.safeParse(base58);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(originalUuid.toLowerCase());
      }
    });

    test('parsing UUID directly returns lowercase UUID', () => {
      const uuid = crypto.randomUUID();
      const result = IncomingIdSchema.safeParse(uuid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(uuid.toLowerCase());
      }
    });

    test('base58 transformation is consistent', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const base58 = idTranslator.fromUUID(uuid);

      const result1 = IncomingIdSchema.safeParse(base58);
      const result2 = IncomingIdSchema.safeParse(base58);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      if (result1.success && result2.success) {
        expect(result1.data).toBe(result2.data);
        expect(result1.data).toBe(uuid.toLowerCase());
      }
    });
  });
});

describe('OutgoingIdSchema', () => {
  describe('valid UUIDs', () => {
    test('converts standard UUID to base58', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const expectedBase58 = idTranslator.fromUUID(uuid);
      const result = OutgoingIdSchema.safeParse(uuid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedBase58);
      }
    });

    test('converts UUID with uppercase letters', () => {
      const uuid = '550E8400-E29B-41D4-A716-446655440000';
      const expectedBase58 = idTranslator.fromUUID(uuid);
      const result = OutgoingIdSchema.safeParse(uuid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedBase58);
      }
    });

    test('converts randomly generated UUID', () => {
      const uuid = crypto.randomUUID();
      const expectedBase58 = idTranslator.fromUUID(uuid);
      const result = OutgoingIdSchema.safeParse(uuid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedBase58);
      }
    });

    test('converts multiple different UUIDs', () => {
      const uuids = [
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ];

      for (const uuid of uuids) {
        const expectedBase58 = idTranslator.fromUUID(uuid);
        const result = OutgoingIdSchema.safeParse(uuid);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(expectedBase58);
        }
      }
    });
  });

  describe('valid base58 IDs', () => {
    test('returns base58 string as-is without transformation', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const base58 = idTranslator.fromUUID(uuid);
      const result = OutgoingIdSchema.safeParse(base58);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(base58);
      }
    });

    test('returns base58 for random UUID as-is', () => {
      const originalUuid = crypto.randomUUID();
      const base58 = idTranslator.fromUUID(originalUuid);
      const result = OutgoingIdSchema.safeParse(base58);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(base58);
      }
    });

    test('returns multiple different base58 IDs as-is', () => {
      const uuids = [
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ];

      for (const uuid of uuids) {
        const base58 = idTranslator.fromUUID(uuid);
        const result = OutgoingIdSchema.safeParse(base58);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(base58);
        }
      }
    });

    test('validates base58 format correctly', () => {
      const validBase58 = idTranslator.fromUUID(crypto.randomUUID());
      expect(idTranslator.validate(validBase58)).toBe(true);

      const result = OutgoingIdSchema.safeParse(validBase58);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(validBase58);
      }
    });
  });

  describe('invalid IDs', () => {
    test('rejects empty string', () => {
      const result = OutgoingIdSchema.safeParse('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects invalid UUID format', () => {
      const result = OutgoingIdSchema.safeParse('not-a-valid-uuid');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects UUID with invalid characters', () => {
      const result = OutgoingIdSchema.safeParse(
        '550e8400-e29b-41d4-a716-44665544000g',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects UUID with wrong length', () => {
      const result = OutgoingIdSchema.safeParse(
        '550e8400-e29b-41d4-a716-4466554400',
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects invalid base58 string', () => {
      const result = OutgoingIdSchema.safeParse('invalid-base58-string!@#');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid ID: must be a valid UUID or base58 string',
        );
      }
    });

    test('rejects number', () => {
      const result = OutgoingIdSchema.safeParse(12345);
      expect(result.success).toBe(false);
    });

    test('rejects null', () => {
      const result = OutgoingIdSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    test('rejects undefined', () => {
      const result = OutgoingIdSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    test('rejects object', () => {
      const result = OutgoingIdSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    test('rejects array', () => {
      const result = OutgoingIdSchema.safeParse([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('converts nil UUID (all zeros) to base58', () => {
      const nilUuid = '00000000-0000-0000-0000-000000000000';
      const expectedBase58 = idTranslator.fromUUID(nilUuid);
      const result = OutgoingIdSchema.safeParse(nilUuid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedBase58);
      }
    });

    test('returns base58 representation of nil UUID as-is', () => {
      const nilUuid = '00000000-0000-0000-0000-000000000000';
      const base58 = idTranslator.fromUUID(nilUuid);
      const result = OutgoingIdSchema.safeParse(base58);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(base58);
      }
    });

    test('rejects UUID without hyphens', () => {
      const result = OutgoingIdSchema.safeParse(
        '550e8400e29b41d4a716446655440000',
      );
      expect(result.success).toBe(false);
    });

    test('converts mixed case UUID to base58', () => {
      const mixedCaseUuid = '550e8400-E29B-41d4-A716-446655440000';
      const expectedBase58 = idTranslator.fromUUID(mixedCaseUuid);
      const result = OutgoingIdSchema.safeParse(mixedCaseUuid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedBase58);
      }
    });
  });

  describe('round-trip conversion', () => {
    test('UUID -> base58 conversion is consistent', () => {
      const originalUuid = crypto.randomUUID();
      const expectedBase58 = idTranslator.fromUUID(originalUuid);
      const result = OutgoingIdSchema.safeParse(originalUuid);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(expectedBase58);
      }
    });

    test('base58 input returns same base58 output', () => {
      const uuid = crypto.randomUUID();
      const base58 = idTranslator.fromUUID(uuid);
      const result = OutgoingIdSchema.safeParse(base58);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(base58);
      }
    });

    test('UUID transformation is consistent', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const expectedBase58 = idTranslator.fromUUID(uuid);

      const result1 = OutgoingIdSchema.safeParse(uuid);
      const result2 = OutgoingIdSchema.safeParse(uuid);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      if (result1.success && result2.success) {
        expect(result1.data).toBe(result2.data);
        expect(result1.data).toBe(expectedBase58);
      }
    });

    test('IncomingIdSchema -> OutgoingIdSchema round-trip', () => {
      const originalUuid = crypto.randomUUID();
      const base58 = idTranslator.fromUUID(originalUuid);

      const incomingResult = IncomingIdSchema.safeParse(base58);
      expect(incomingResult.success).toBe(true);

      if (incomingResult.success) {
        const outgoingResult = OutgoingIdSchema.safeParse(incomingResult.data);
        expect(outgoingResult.success).toBe(true);

        if (outgoingResult.success) {
          expect(outgoingResult.data).toBe(base58);
        }
      }
    });

    test('OutgoingIdSchema -> IncomingIdSchema round-trip', () => {
      const originalUuid = crypto.randomUUID();

      const outgoingResult = OutgoingIdSchema.safeParse(originalUuid);
      expect(outgoingResult.success).toBe(true);

      if (outgoingResult.success) {
        const incomingResult = IncomingIdSchema.safeParse(outgoingResult.data);
        expect(incomingResult.success).toBe(true);

        if (incomingResult.success) {
          expect(incomingResult.data).toBe(originalUuid.toLowerCase());
        }
      }
    });
  });
});
