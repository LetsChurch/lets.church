import { z } from 'zod';
import { getBibleReferences } from './bible';

const streamUnionSchema = z
  .discriminatedUnion('codec_type', [
    z.looseObject({
      codec_type: z.literal('video'),
      codec_name: z.string(),
      width: z.number(),
      height: z.number(),
      nb_frames: z.string().optional(),
    }),
    z.looseObject({
      codec_type: z.literal('audio'),
    }),
    z.looseObject({
      codec_type: z.literal('data'),
    }),
  ])
  .and(
    z.looseObject({
      index: z.number(),
    }),
  );

export const ffprobeSchema = z.object({
  streams: z.array(streamUnionSchema),
  format: z.object({
    filename: z.string(),
    format_name: z.string(),
    duration: z.string(),
    nb_streams: z.number(),
  }),
});

export type Probe = z.infer<typeof ffprobeSchema>;

export const transcriptSegmentSchema = z.array(
  z
    .object({
      text: z.string(),
      start: z.number(),
      end: z.number(),
    })
    .transform((segment) => ({
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

export const imageMagickJsonSchema = z.array(
  z.looseObject({
    version: z.string(),
    image: z.object({
      format: z.string(),
      mimeType: z.string(),
    }),
  }),
);

export function probeIsAudioFile(probe: Probe) {
  if (probe.format.format_name === 'mp3') {
    return true;
  }

  const streams = probe.streams.filter((s) => s.codec_name !== 'mjpeg');

  return streams.length === 1 && streams.at(0)?.codec_type === 'audio';
}

export function probeIsVideoFile(probe: Probe) {
  return !probeIsAudioFile(probe);
}
