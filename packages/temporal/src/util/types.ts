export const uploadPostProcessValues = [
  'media',
  'thumbnail',
  'profileAvatar',
  'channelAvatar',
  'organizationAvatar',
  'channelDefaultThumbnail',
  'channelCover',
  'organizationCover',
] as const;

export type UploadPostProcessValue = (typeof uploadPostProcessValues)[number];
