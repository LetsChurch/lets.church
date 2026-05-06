// Plain objects satisfying SearchAttributeKey<'KEYWORD'> — no imports needed,
// safe in workflow sandbox, client code, and Node.js server code.

export const UPLOAD_ID_KEY = { name: 'UploadId', type: 'KEYWORD' } as const;
export const USER_ID_KEY = { name: 'UserId', type: 'KEYWORD' } as const;
export const USERNAME_KEY = { name: 'Username', type: 'KEYWORD' } as const;
export const CHANNEL_SLUG_KEY = {
  name: 'ChannelSlug',
  type: 'KEYWORD',
} as const;
export const CHANNEL_ID_KEY = { name: 'ChannelId', type: 'KEYWORD' } as const;
export const IMPORT_SOURCE_ID_KEY = {
  name: 'ImportSourceId',
  type: 'KEYWORD',
} as const;
