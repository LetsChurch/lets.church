export type ReprocessScope =
  | { kind: 'legacy' }
  | { kind: 'all' }
  | { kind: 'channel'; channelId: string };
