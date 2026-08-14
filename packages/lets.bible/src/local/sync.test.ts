import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LocalHighlight, LocalNote, LocalProgress } from './types';

type Row = LocalHighlight | LocalNote | LocalProgress;

class TestCollection<T extends Row> {
  readonly rows = new Map<string, T>();

  constructor(
    private readonly keyOf: (row: T) => string,
    initial: T[] = [],
  ) {
    for (const row of initial) this.rows.set(keyOf(row), row);
  }

  values() {
    return this.rows.values();
  }

  get(key: string) {
    return this.rows.get(key);
  }

  has(key: string) {
    return this.rows.has(key);
  }

  insert(row: T) {
    this.rows.set(this.keyOf(row), row);
  }

  update(key: string, mutate: (row: T) => void) {
    const row = this.rows.get(key);
    if (!row) throw new Error(`Missing test row: ${key}`);
    mutate(row);
  }

  delete(key: string) {
    this.rows.delete(key);
  }

  preload() {
    return Promise.resolve();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mocks = vi.hoisted(() => ({
  collections: undefined as
    | {
        highlights: TestCollection<LocalHighlight>;
        notes: TestCollection<LocalNote>;
        progress: TestCollection<LocalProgress>;
      }
    | undefined,
  setHighlight: vi.fn(),
  removeHighlight: vi.fn(),
  setNote: vi.fn(),
  removeNote: vi.fn(),
  recordReading: vi.fn(),
  syncQuery: vi.fn(),
  recent: vi.fn(),
}));

vi.mock('./collections', () => ({
  collections: () => mocks.collections,
}));

vi.mock('@/trpc/react', () => ({
  trpcClient: {
    library: {
      setHighlight: { mutate: mocks.setHighlight },
      removeHighlight: { mutate: mocks.removeHighlight },
      setNote: { mutate: mocks.setNote },
      removeNote: { mutate: mocks.removeNote },
      recordReading: { mutate: mocks.recordReading },
      sync: { query: mocks.syncQuery },
      recent: { query: mocks.recent },
    },
  },
}));

import { pullServer, pushDirty, setSyncSignedIn } from './sync';

function highlight(overrides: Partial<LocalHighlight> = {}): LocalHighlight {
  return {
    ref: 'JHN.3.16',
    book: 'JHN',
    chapter: 3,
    verse: 16,
    color: 'gold',
    updatedAt: 1,
    dirty: true,
    deleted: false,
    ...overrides,
  };
}

function note(overrides: Partial<LocalNote> = {}): LocalNote {
  return {
    ref: 'JHN.3.16',
    book: 'JHN',
    chapter: 3,
    verse: 16,
    body: 'first',
    updatedAt: 1,
    dirty: true,
    deleted: false,
    ...overrides,
  };
}

function installCollections({
  highlights = [],
  notes = [],
  progress = [],
}: {
  highlights?: LocalHighlight[];
  notes?: LocalNote[];
  progress?: LocalProgress[];
} = {}) {
  mocks.collections = {
    highlights: new TestCollection((row) => row.ref, highlights),
    notes: new TestCollection((row) => row.ref, notes),
    progress: new TestCollection((row) => row.key, progress),
  };
  return mocks.collections;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { onLine: true });
  installCollections();
  mocks.syncQuery.mockResolvedValue({ highlights: [], notes: [] });
  mocks.recent.mockResolvedValue([]);
  mocks.setHighlight.mockResolvedValue({
    ok: true,
    updatedAt: new Date(100),
  });
  mocks.removeHighlight.mockResolvedValue({
    ok: true,
    updatedAt: new Date(100),
  });
  mocks.setNote.mockResolvedValue({ ok: true, updatedAt: new Date(100) });
  mocks.removeNote.mockResolvedValue({ ok: true, updatedAt: new Date(100) });
  mocks.recordReading.mockResolvedValue({
    ok: true,
    updatedAt: new Date(100),
  });
  setSyncSignedIn(true);
});

describe('local library sync', () => {
  it('does not acknowledge a newer edit with an older mutation response', async () => {
    const first = deferred<{ ok: boolean; updatedAt: Date }>();
    const second = deferred<{ ok: boolean; updatedAt: Date }>();
    mocks.setHighlight
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const c = installCollections({ highlights: [highlight()] });

    const syncing = pushDirty();
    await vi.waitFor(() => expect(mocks.setHighlight).toHaveBeenCalledOnce());
    c.highlights.update('JHN.3.16', (row) => {
      row.color = 'sage';
      row.updatedAt = 2;
      row.dirty = true;
    });
    first.resolve({ ok: true, updatedAt: new Date(100) });
    await vi.waitFor(() => expect(mocks.setHighlight).toHaveBeenCalledTimes(2));
    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      color: 'sage',
      updatedAt: 2,
      dirty: true,
    });

    second.resolve({ ok: true, updatedAt: new Date(200) });
    await syncing;
    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      color: 'sage',
      updatedAt: 200,
      dirty: false,
    });
  });

  it('does not delete a row that was re-added while its delete was in flight', async () => {
    const first = deferred<{ ok: boolean; updatedAt: Date }>();
    const second = deferred<{ ok: boolean; updatedAt: Date }>();
    mocks.removeHighlight.mockReturnValueOnce(first.promise);
    mocks.setHighlight.mockReturnValueOnce(second.promise);
    const c = installCollections({
      highlights: [highlight({ deleted: true, updatedAt: 2 })],
    });

    const syncing = pushDirty();
    await vi.waitFor(() =>
      expect(mocks.removeHighlight).toHaveBeenCalledOnce(),
    );
    c.highlights.update('JHN.3.16', (row) => {
      row.color = 'slate';
      row.deleted = false;
      row.updatedAt = 3;
      row.dirty = true;
    });
    first.resolve({ ok: true, updatedAt: new Date(100) });
    await vi.waitFor(() => expect(mocks.setHighlight).toHaveBeenCalledOnce());
    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      color: 'slate',
      deleted: false,
      updatedAt: 3,
      dirty: true,
    });

    second.resolve({ ok: true, updatedAt: new Date(200) });
    await syncing;
    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      color: 'slate',
      deleted: false,
      updatedAt: 200,
      dirty: false,
    });
  });

  it('retains an acknowledged delete as a clean server-versioned tombstone', async () => {
    const c = installCollections({
      highlights: [highlight({ deleted: true, updatedAt: 2 })],
    });

    await pushDirty();

    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      deleted: true,
      dirty: false,
      updatedAt: 100,
    });
  });

  it('drains one sync request queued while another pass is active', async () => {
    const first = deferred<{ ok: boolean; updatedAt: Date }>();
    mocks.setHighlight.mockReturnValueOnce(first.promise);
    const c = installCollections({ highlights: [highlight()] });

    const active = pushDirty();
    await vi.waitFor(() => expect(mocks.setHighlight).toHaveBeenCalledOnce());
    c.highlights.insert(highlight({ ref: 'JHN.3.17', verse: 17 }));
    const queued = pushDirty();
    expect(mocks.setHighlight).toHaveBeenCalledOnce();
    first.resolve({ ok: true, updatedAt: new Date(100) });
    await Promise.all([active, queued]);

    expect(mocks.setHighlight).toHaveBeenCalledTimes(2);
    expect(mocks.setHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ verse: 17 }),
    );
  });

  it('keeps anonymous local writes dirty and off the transport', async () => {
    const c = installCollections({ highlights: [highlight()] });
    setSyncSignedIn(false);

    await pushDirty();

    expect(mocks.setHighlight).not.toHaveBeenCalled();
    expect(c.highlights.get('JHN.3.16')?.dirty).toBe(true);
  });

  it('acknowledges reading progress with the server timestamp', async () => {
    const c = installCollections({
      progress: [
        {
          key: 'JHN.3',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          updatedAt: 1,
          dirty: true,
        },
      ],
    });

    await pushDirty();

    expect(mocks.recordReading).toHaveBeenCalledWith({
      book: 'JHN',
      chapter: 3,
      verse: 16,
    });
    expect(c.progress.get('JHN.3')).toMatchObject({
      updatedAt: 100,
      dirty: false,
    });
  });

  it('never overwrites dirty local rows during pull', async () => {
    const c = installCollections({
      highlights: [highlight({ color: 'sage', updatedAt: 200 })],
      notes: [note({ body: 'local', updatedAt: 200 })],
    });
    mocks.syncQuery.mockResolvedValue({
      highlights: [
        {
          ref: 'JHN.3.16',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          color: 'gold',
          updatedAt: new Date(300),
          deletedAt: null,
        },
      ],
      notes: [
        {
          ref: 'JHN.3.16',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          body: 'server',
          updatedAt: new Date(300),
          deletedAt: null,
        },
      ],
    });

    await pullServer();

    expect(c.highlights.get('JHN.3.16')?.color).toBe('sage');
    expect(c.notes.get('JHN.3.16')?.body).toBe('local');
  });

  it('applies server tombstones only to clean older local rows', async () => {
    const c = installCollections({
      highlights: [highlight({ dirty: false, updatedAt: 100 })],
      notes: [note({ dirty: false, updatedAt: 400 })],
    });
    mocks.syncQuery.mockResolvedValue({
      highlights: [
        {
          ref: 'JHN.3.16',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          color: 'gold',
          updatedAt: new Date(300),
          deletedAt: new Date(300),
        },
      ],
      notes: [
        {
          ref: 'JHN.3.16',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          body: 'old server note',
          updatedAt: new Date(300),
          deletedAt: new Date(300),
        },
      ],
    });

    await pullServer();

    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      deleted: true,
      dirty: false,
      updatedAt: 300,
    });
    expect(c.notes.get('JHN.3.16')?.body).toBe('first');
  });

  it('converges a clean second device through set, delete, and re-add', async () => {
    const c = installCollections();
    mocks.syncQuery.mockResolvedValueOnce({
      highlights: [
        {
          ref: 'JHN.3.16',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          color: 'gold',
          updatedAt: new Date(100),
          deletedAt: null,
        },
      ],
      notes: [],
    });
    await pullServer();
    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      color: 'gold',
      updatedAt: 100,
      dirty: false,
    });

    mocks.syncQuery.mockResolvedValueOnce({
      highlights: [
        {
          ref: 'JHN.3.16',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          color: 'gold',
          updatedAt: new Date(200),
          deletedAt: new Date(200),
        },
      ],
      notes: [],
    });
    await pullServer();
    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      deleted: true,
      dirty: false,
      updatedAt: 200,
    });

    mocks.syncQuery.mockResolvedValueOnce({
      highlights: [
        {
          ref: 'JHN.3.16',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          color: 'gold',
          updatedAt: new Date(100),
          deletedAt: null,
        },
      ],
      notes: [],
    });
    await pullServer();
    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      deleted: true,
      updatedAt: 200,
    });

    mocks.syncQuery.mockResolvedValueOnce({
      highlights: [
        {
          ref: 'JHN.3.16',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          color: 'sage',
          updatedAt: new Date(300),
          deletedAt: null,
        },
      ],
      notes: [],
    });
    await pullServer();
    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      color: 'sage',
      updatedAt: 300,
    });

    mocks.syncQuery.mockResolvedValueOnce({
      highlights: [
        {
          ref: 'JHN.3.16',
          book: 'JHN',
          chapter: 3,
          verse: 16,
          color: 'gold',
          updatedAt: new Date(200),
          deletedAt: new Date(200),
        },
      ],
      notes: [],
    });
    await pullServer();
    expect(c.highlights.get('JHN.3.16')).toMatchObject({
      color: 'sage',
      updatedAt: 300,
    });
  });
});
