export const uploadPostProcessValues = [
  'media',
  'thumbnail',
  'profileAvatar',
  'channelAvatar',
  'channelDefaultThumbnail',
] as const;

export type UploadPostProcessValue = (typeof uploadPostProcessValues)[number];
