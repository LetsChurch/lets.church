import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    sources: [] as Array<Record<string, unknown>>,
    batches: [] as Array<Record<string, unknown>>,
    items: [] as Array<Record<string, unknown>>,
    failStageInsert: false,
    allowPendingBatchLookup: true,
  },
  triggerHistoricalImport:
    vi.fn<(sourceId: string, batchId: string) => Promise<void>>(),
  startImportSourceScheduler: vi.fn<(sourceId: string) => Promise<void>>(),
  cancelImportSourceScheduler: vi.fn(),
  deleteImportSourceScheduler: vi.fn(),
  triggerManualImport: vi.fn(),
}));

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://unused:unused@127.0.0.1:1/unused';
});

vi.mock('@letschurch/db', async () => {
  // This test replaces the connection-bearing package entry with its static
  // schema exports and an in-memory transaction implementation.
  const schema = await import('@letschurch/db/schema');
  const makeTransactionClient = (working: typeof mocks.state) => ({
    insert: (table: unknown) => ({
      values: (
        values: Record<string, unknown> | Array<Record<string, unknown>>,
      ) => {
        if (table === schema.ChannelImportHistoryItem) {
          if (working.failStageInsert) {
            throw new Error('forced stage insert failure');
          }
          working.items.push(...(values as Array<Record<string, unknown>>));
          return Promise.resolve();
        }

        return {
          returning: async () => {
            if (table === schema.ChannelImportSource) {
              const value = values as Record<string, unknown>;
              const source = {
                id: crypto.randomUUID(),
                enabled: value.enabled ?? true,
                workflowStatus: 'NOT_STARTED',
                workflowId: null,
                lastErrorAt: null,
                lastErrorMessage: null,
                ...value,
              };
              working.sources.push(source);
              return [source];
            }
            if (table === schema.ChannelImportHistoryBatch) {
              const value = values as Record<string, unknown>;
              const batch = {
                status: 'PENDING',
                processedItems: 0,
                lastError: null,
                startedAt: null,
                completedAt: null,
                failedAt: null,
                createdAt: new Date(),
                ...value,
              };
              working.batches.push(batch);
              return [batch];
            }
            throw new Error('Unexpected test insert');
          },
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (table !== schema.ChannelImportSource) {
              return [];
            }
            Object.assign(working.sources[0]!, values);
            return [working.sources[0]];
          },
        }),
      }),
    }),
  });

  const db = {
    query: {
      ChannelImportSource: {
        findFirst: async () => mocks.state.sources[0] ?? null,
      },
      ChannelImportHistoryBatch: {
        findFirst: async () => {
          const batch = mocks.state.batches[0];
          if (!batch) return null;
          if (batch.status === 'FAILED') return batch;
          if (mocks.state.allowPendingBatchLookup) {
            mocks.state.allowPendingBatchLookup = false;
            return batch;
          }
          return null;
        },
      },
    },
    transaction: async <T>(callback: (tx: object) => Promise<T>) => {
      const working = structuredClone(mocks.state);
      const result = await callback(makeTransactionClient(working));
      Object.assign(mocks.state, working);
      return result;
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === schema.ChannelImportHistoryBatch) {
            Object.assign(mocks.state.batches[0]!, values);
          } else if (table === schema.ChannelImportSource) {
            Object.assign(mocks.state.sources[0]!, values);
          }
        },
      }),
    }),
  };

  return { ...schema, db };
});

vi.mock('@/temporal', () => ({
  triggerHistoricalImport: mocks.triggerHistoricalImport,
  startImportSourceScheduler: mocks.startImportSourceScheduler,
  cancelImportSourceScheduler: mocks.cancelImportSourceScheduler,
  deleteImportSourceScheduler: mocks.deleteImportSourceScheduler,
  triggerManualImport: mocks.triggerManualImport,
}));

vi.mock('@/util/maintenance', () => ({
  getMaintenanceConfig: async () => ({ maintenanceMode: false }),
}));

const { HISTORICAL_IMPORT_ITEM_MAX, importSourceSchema } =
  await import('@/schemas/dashboard/import-sources');
const { importSourcesRouter } = await import('./import-sources');

const adminContext = {
  session: {
    appUserId: '00000000-0000-4000-8000-000000000010',
  },
  isSiteAdmin: true,
  req: new Request('https://example.test/trpc'),
  resHeaders: new Headers(),
};

function inputWithHistory(itemCount: number) {
  return {
    channelId: '00000000-0000-4000-8000-000000000020',
    url: 'https://example.com/feed.xml',
    enabled: false,
    importHistory: Array.from({ length: itemCount }, (_, index) => ({
      publishedAt: new Date(Date.UTC(2025, 0, 1, 0, index)),
      source: 'legacy',
      title: `Historical ${index}`,
      description: `Description ${index}`,
      url: `https://example.com/history/${index}`,
    })),
  };
}

beforeEach(() => {
  mocks.state.sources = [];
  mocks.state.batches = [];
  mocks.state.items = [];
  mocks.state.failStageInsert = false;
  mocks.state.allowPendingBatchLookup = true;
  vi.clearAllMocks();
  mocks.triggerHistoricalImport.mockResolvedValue();
  mocks.startImportSourceScheduler.mockImplementation(async () => {
    Object.assign(mocks.state.sources[0]!, { workflowStatus: 'RUNNING' });
  });
});

describe('historical import source input', () => {
  test('accepts the published maximum and rejects maximum plus one', () => {
    expect(
      importSourceSchema.safeParse(inputWithHistory(HISTORICAL_IMPORT_ITEM_MAX))
        .success,
    ).toBe(true);
    expect(
      importSourceSchema.safeParse(
        inputWithHistory(HISTORICAL_IMPORT_ITEM_MAX + 1),
      ).success,
    ).toBe(false);
  });
});

describe('import source staging and startup', () => {
  test('rolls back the source and batch when a stage insert fails', async () => {
    mocks.state.failStageInsert = true;
    const caller = importSourcesRouter.createCaller(adminContext as never);

    await expect(caller.create(inputWithHistory(1))).rejects.toThrow(
      'forced stage insert failure',
    );
    expect(mocks.state.sources).toHaveLength(0);
    expect(mocks.state.batches).toHaveLength(0);
    expect(mocks.state.items).toHaveLength(0);
    expect(mocks.triggerHistoricalImport).not.toHaveBeenCalled();
  });

  test('persists every boundary ordinal in bounded stage inserts', async () => {
    const caller = importSourcesRouter.createCaller(adminContext as never);
    const result = await caller.create(
      inputWithHistory(HISTORICAL_IMPORT_ITEM_MAX),
    );

    expect(result.startup.ok).toBe(true);
    expect(mocks.state.items).toHaveLength(HISTORICAL_IMPORT_ITEM_MAX);
    expect(mocks.state.items.map((item) => item.ordinal)).toEqual(
      Array.from({ length: HISTORICAL_IMPORT_ITEM_MAX }, (_, index) => index),
    );
    expect(mocks.triggerHistoricalImport).toHaveBeenCalledTimes(1);
    const serializedArgs = JSON.stringify(
      mocks.triggerHistoricalImport.mock.calls[0],
    );
    expect(serializedArgs).not.toContain('Historical 0');
    expect(serializedArgs).not.toContain('Description 0');
    expect(serializedArgs).not.toContain('legacy');
    expect(serializedArgs).not.toContain('https://example.com/history/0');
    expect(mocks.triggerHistoricalImport.mock.calls[0]).toEqual([
      result.id,
      result.historicalImportBatch?.id,
    ]);
  });

  test('exposes start failure and retries it once without another workflow', async () => {
    mocks.triggerHistoricalImport.mockRejectedValueOnce(
      new Error('Temporal unavailable'),
    );
    const caller = importSourcesRouter.createCaller(adminContext as never);
    const created = await caller.create(inputWithHistory(1));

    expect(created.startup.ok).toBe(false);
    expect(created.historicalImportBatch?.id).toBeTruthy();
    expect(mocks.state.batches[0]?.status).toBe('FAILED');
    expect(mocks.state.batches[0]?.lastError).toBe(
      'Failed to start historical import workflow',
    );

    await expect(
      caller.retryWorkflows({ id: created.id }),
    ).resolves.toMatchObject({ success: true });
    expect(mocks.triggerHistoricalImport).toHaveBeenCalledTimes(2);
    expect(mocks.state.batches[0]?.status).toBe('PENDING');
    expect(mocks.state.batches[0]?.lastError).toBeNull();

    await caller.retryWorkflows({ id: created.id });
    expect(mocks.triggerHistoricalImport).toHaveBeenCalledTimes(2);
  });

  test('creates scheduler-only sources without a historical batch', async () => {
    const caller = importSourcesRouter.createCaller(adminContext as never);
    const result = await caller.create({
      channelId: '00000000-0000-4000-8000-000000000020',
      url: 'https://example.com/feed.xml',
      enabled: true,
      importHistory: [],
    });

    expect(result.historicalImportBatch).toBeNull();
    expect(result.startup).toMatchObject({
      ok: true,
      historicalBatchStarted: false,
      schedulerStarted: true,
    });
    expect(mocks.triggerHistoricalImport).not.toHaveBeenCalled();
    expect(mocks.startImportSourceScheduler).toHaveBeenCalledTimes(1);
  });

  test('requires site-admin authorization for retry', async () => {
    const caller = importSourcesRouter.createCaller({
      ...adminContext,
      isSiteAdmin: false,
    } as never);

    await expect(
      caller.retryWorkflows({
        id: '00000000-0000-4000-8000-000000000030',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.triggerHistoricalImport).not.toHaveBeenCalled();
    expect(mocks.startImportSourceScheduler).not.toHaveBeenCalled();
  });
});
