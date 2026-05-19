export type RemuxScope =
  | { kind: 'legacy' }
  | { kind: 'channel'; channelId: string };
