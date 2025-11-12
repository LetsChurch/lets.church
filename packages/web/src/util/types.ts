export const uploadPostProcessValues = [
  'media',
  'thumbnail',
  'profileAvatar',
  'channelAvatar',
  'organizationAvatar',
  'channelDefaultThumbnail',
] as const;

export type UploadPostProcessValue = (typeof uploadPostProcessValues)[number];
