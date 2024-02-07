import { z } from 'zod';
import { getBibleReferences } from './bible';

export const identifiableSchema = z.object({
  id: z.string().uuid(),
});

const streamUnionSchema = z
  .discriminatedUnion('codec_type', [
    z
      .object({
        codec_type: z.literal('video'),
        codec_name: z.string(),
        width: z.number(),
        height: z.number(),
        nb_frames: z.string().optional(),
      })
      .passthrough(),
    z
      .object({
        codec_type: z.literal('audio'),
      })
      .passthrough(),
    z
      .object({
        codec_type: z.literal('data'),
      })
      .passthrough(),
  ])
  .and(
    z
      .object({
        index: z.number(),
      })
      .passthrough(),
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
  z
    .object({
      version: z.string(),
      image: z.object({
        format: z.string(),
        mimeType: z.string(),
      }),
    })
    .passthrough(),
);

export function probeIsAudioFile(probe: Probe) {
  if (probe.format.format_name === 'mp3') {
    return true;
  }

  return (
    probe.format.nb_streams === 1 && probe.streams.at(0)?.codec_type === 'audio'
  );
}

export function probeIsVideoFile(probe: Probe) {
  return !probeIsAudioFile(probe);
}
