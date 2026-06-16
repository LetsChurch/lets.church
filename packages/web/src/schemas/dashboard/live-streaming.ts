import { UploadLicense, UploadVisibility } from '@letschurch/db/types';
import { z } from 'zod';
import { channelIdSchema } from './channel';

// All live-streaming procedures are channel-scoped; channelId is merged in by
// the shared channelAdminProcedure, but each schema repeats it so the input
// types are self-contained.
export const setNextBroadcastSchema = z.object({
  channelId: channelIdSchema,
  title: z.string().min(1, 'Title is required'),
  description: z.string(),
  visibility: z.nativeEnum(UploadVisibility),
  license: z.nativeEnum(UploadLicense),
  commentsEnabled: z.boolean(),
  downloadsEnabled: z.boolean(),
  // Series (upload_list) to add the broadcast to, or null for none.
  seriesId: z.string().uuid().nullable(),
});

export const addSimulcastTargetSchema = z.object({
  channelId: channelIdSchema,
  label: z.string().min(1, 'Label is required'),
  url: z
    .string()
    .min(1, 'RTMP URL is required')
    .regex(/^rtmps?:\/\//, 'Must be an rtmp:// or rtmps:// URL'),
  streamKey: z.string().min(1, 'Stream key is required'),
});

export const removeSimulcastTargetSchema = z.object({
  channelId: channelIdSchema,
  targetId: z.string().uuid(),
});
