export const dashboardQueryKeys = {
  uploads: {
    list: (channelId: string, page: number, limit: number) =>
      [
        'dashboard',
        'channels',
        { channelId },
        'uploads',
        { page, limit },
      ] as const,
    detail: (channelId: string, uploadId: string) =>
      [
        'dashboard',
        'channels',
        { channelId },
        'uploads',
        { uploadId },
      ] as const,
    all: (channelId: string) =>
      ['dashboard', 'channels', { channelId }, 'uploads'] as const,
  },
};
