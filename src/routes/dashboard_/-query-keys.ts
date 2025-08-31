export const dashboardQueryKeys = {
  channels: {
    all: () => ['dashboard', 'channels'] as const,
    list: (page?: number, limit?: number) =>
      page && limit
        ? (['dashboard', 'channels', { page, limit }] as const)
        : (['dashboard', 'channels'] as const),
    detail: (channelId: string) =>
      ['dashboard', 'channels', { channelId }] as const,
    edit: (channelId: string) =>
      ['dashboard', 'channels', { channelId }, 'edit'] as const,
    members: (channelId: string) =>
      ['dashboard', 'channels', { channelId }, 'members'] as const,
  },
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
    progress: (channelId: string, uploadId: string) =>
      ['uploadProgress', channelId, uploadId] as const,
  },
  churches: {
    all: () => ['dashboard', 'churches'] as const,
    detail: (churchId: string) =>
      ['dashboard', 'churches', { churchId }] as const,
  },
  users: {
    search: (channelId: string, query: string) =>
      ['users', 'search', channelId, query] as const,
  },
};
