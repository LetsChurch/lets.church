const FLOAT32_BYTES = 4;

/**
 * Encode a float k-NN vector using OpenSearch 3.8's Base64 ingestion format.
 * Float vectors are contiguous IEEE-754 float32 values in little-endian order.
 */
export function encodeKnnFloatVector(
  vector: ArrayLike<number>,
  dimensions: number,
): string {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new RangeError(`Vector dimensions must be a positive integer`);
  }
  if (vector.length !== dimensions) {
    throw new RangeError(
      `Expected a ${dimensions}-dimension vector, received ${vector.length}`,
    );
  }

  const bytes = Buffer.allocUnsafe(dimensions * FLOAT32_BYTES);
  for (let i = 0; i < dimensions; i += 1) {
    const value = vector[i];
    if (!Number.isFinite(value)) {
      throw new TypeError(`Vector element ${i} is not finite`);
    }
    bytes.writeFloatLE(value, i * FLOAT32_BYTES);
  }
  return bytes.toString('base64');
}
