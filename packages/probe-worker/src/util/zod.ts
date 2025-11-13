import { z } from 'zod';

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
