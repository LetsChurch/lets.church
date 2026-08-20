import { describe, expect, it } from 'vitest';

import { encodeKnnFloatVector } from './knn-vector';

describe('encodeKnnFloatVector', () => {
  it('uses OpenSearch float32 little-endian Base64 encoding', () => {
    expect(encodeKnnFloatVector([1, 2, 3, 4], 4)).toBe(
      'AACAPwAAAEAAAEBAAACAQA==',
    );
  });

  it('accepts typed arrays without an intermediate number array', () => {
    const encoded = encodeKnnFloatVector(new Float32Array([-1.5, 0.25]), 2);
    const bytes = Buffer.from(encoded, 'base64');

    expect(bytes.byteLength).toBe(8);
    expect(bytes.readFloatLE(0)).toBe(-1.5);
    expect(bytes.readFloatLE(4)).toBe(0.25);
  });

  it('rejects dimension mismatches', () => {
    expect(() => encodeKnnFloatVector([1], 2)).toThrow(
      'Expected a 2-dimension vector, received 1',
    );
  });

  it('rejects non-finite values', () => {
    expect(() => encodeKnnFloatVector([Number.NaN], 1)).toThrow(
      'Vector element 0 is not finite',
    );
  });
});
