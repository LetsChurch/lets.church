import * as Z from 'zod';
import { getBibleReferences } from './bible';

export const identifiableSchema = Z.object({
  id: Z.string().uuid(),
});

const streamUnionSchema = Z.discriminatedUnion('codec_type', [
  Z.object({
    codec_type: Z.literal('video'),
    width: Z.number(),
    height: Z.number(),
    nb_frames: Z.string().optional(),
  }).passthrough(),
  Z.object({
    codec_type: Z.literal('audio'),
  }).passthrough(),
  Z.object({
    codec_type: Z.literal('data'),
  }).passthrough(),
]).and(
  Z.object({
    index: Z.number(),
  }).passthrough(),
);

export const ffprobeSchema = Z.object({
  streams: Z.array(streamUnionSchema),
  format: Z.object({
    filename: Z.string(),
    format_name: Z.string(),
    duration: Z.string(),
    nb_streams: Z.number(),
  }),
});

export const transcriptSegmentSchema = Z.array(
  Z.object({
    text: Z.string(),
    start: Z.number(),
    end: Z.number(),
  }).transform((segment) => ({
    ...segment,
    bibleReferences: Array.from(getBibleReferences(segment.text)).map(
      ({ book, chapter, verse }) => ({
        book: book as string,
        chapter: chapter ?? null,
        verse: verse ?? null,
      }),
    ),
  })),
);

export const imageMagickJsonSchema = Z.array(
  Z.object({
    version: Z.string(),
    image: Z.object({
      format: Z.string(),
      mimeType: Z.string(),
    }),
  }).passthrough(),
);
