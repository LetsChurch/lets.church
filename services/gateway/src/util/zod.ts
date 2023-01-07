import * as Z from 'zod';
import { getBibleReferences } from './bible';

export const identifiableSchema = Z.object({
  id: Z.string().uuid(),
});

const streamUnionSchema = Z.discriminatedUnion('codec_type', [
  Z.object({
    codec_type: Z.literal('video'),
    codec_name: Z.string(),
    codec_long_name: Z.string(),
    codec_tag_string: Z.string(),
    codec_tag: Z.string(),
    width: Z.number(),
    height: Z.number(),
    coded_width: Z.number(),
    coded_height: Z.number(),
    closed_captions: Z.number(),
    film_grain: Z.number().optional(),
    has_b_frames: Z.number(),
    sample_aspect_ratio: Z.string(),
    display_aspect_ratio: Z.string(),
    pix_fmt: Z.string(),
    level: Z.number(),
    color_range: Z.string(),
    color_space: Z.string(),
    color_transfer: Z.string().optional(),
    color_primaries: Z.string().optional(),
    chroma_location: Z.string(),
    field_order: Z.string().optional(),
    refs: Z.number(),
    is_avc: Z.string().optional(),
    nal_length_size: Z.string().optional(),
    bits_per_raw_sample: Z.string(),
    nb_frames: Z.string().optional(),
    profile: Z.string(),
  }).passthrough(),
  Z.object({
    codec_type: Z.literal('audio'),
    codec_name: Z.string(),
    codec_long_name: Z.string(),
    codec_tag_string: Z.string(),
    codec_tag: Z.string(),
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
    nb_streams: Z.number(),
    nb_programs: Z.number(),
    format_name: Z.string(),
    format_long_name: Z.string(),
    start_time: Z.string(),
    duration: Z.string(),
    size: Z.string(),
    bit_rate: Z.string(),
    probe_score: Z.number(),
    tags: Z.object({
      major_brand: Z.string(),
      minor_version: Z.string(),
      compatible_brands: Z.string(),
      encoder: Z.string(),
    }).partial(),
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
