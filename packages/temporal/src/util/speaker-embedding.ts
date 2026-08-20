import { z } from 'zod';

export const SPEAKER_EMBED_DIMS = 192;

export const speakerEmbeddingSchema = z
  .array(z.number().finite())
  .length(SPEAKER_EMBED_DIMS);
