import { describe, expect, it } from 'vitest';

import {
  SPEAKER_EMBED_DIMS,
  speakerEmbeddingSchema,
} from './speaker-embedding';

describe('speakerEmbeddingSchema', () => {
  it('accepts exactly one finite Titanet vector', () => {
    expect(
      speakerEmbeddingSchema.parse(Array(SPEAKER_EMBED_DIMS).fill(0.25)),
    ).toHaveLength(SPEAKER_EMBED_DIMS);
  });

  it('rejects vectors with the wrong dimension', () => {
    expect(() =>
      speakerEmbeddingSchema.parse(Array(SPEAKER_EMBED_DIMS - 1).fill(0.25)),
    ).toThrow();
  });

  it('rejects non-finite vector elements', () => {
    const vector = Array(SPEAKER_EMBED_DIMS).fill(0.25);
    vector[0] = Number.POSITIVE_INFINITY;

    expect(() => speakerEmbeddingSchema.parse(vector)).toThrow();
  });
});
