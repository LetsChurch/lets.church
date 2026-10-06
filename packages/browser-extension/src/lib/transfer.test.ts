import { describe, expect, test } from 'vitest';

import {
  clearSpoolFiles,
  type SpoolDirectory,
  spoolToDisk,
  splitIntoParts,
} from './transfer';

function streamOf(chunks: Array<Array<number>>) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new Uint8Array(chunk));
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>, partSize: number) {
  const parts: Array<Array<number>> = [];
  for await (const part of splitIntoParts(stream, partSize)) {
    parts.push([...part]);
  }
  return parts;
}

describe('splitIntoParts', () => {
  test('re-chunks arbitrary network chunks into fixed-size parts', async () => {
    expect(
      await collect(streamOf([[1, 2], [3, 4, 5, 6, 7], [8], [9, 10]]), 4),
    ).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10],
    ]);
  });

  test('emits no empty trailing part on an exact multiple', async () => {
    expect(await collect(streamOf([[1, 2, 3, 4]]), 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  test('yields nothing for an empty stream', async () => {
    expect(await collect(streamOf([]), 4)).toEqual([]);
  });
});

/** Minimal in-memory stand-in for an OPFS directory. */
function fakeDirectory(initial: Array<string> = []) {
  const files = new Map<string, Array<Uint8Array<ArrayBuffer>>>(
    initial.map((name) => [name, []]),
  );
  const dir = {
    async getFileHandle(name: string) {
      files.set(name, files.get(name) ?? []);
      return {
        async createWritable() {
          return new WritableStream<Uint8Array<ArrayBuffer>>({
            write(chunk) {
              files.get(name)?.push(chunk);
            },
          });
        },
        async getFile() {
          return new File(files.get(name) ?? [], name);
        },
      };
    },
    async removeEntry(name: string) {
      files.delete(name);
    },
    async *keys() {
      yield* files.keys();
    },
  };
  return { files, dir: dir as unknown as SpoolDirectory };
}

describe('spoolToDisk', () => {
  test('writes the download and removes it on cleanup', async () => {
    const { files, dir } = fakeDirectory();
    const { file, cleanup } = await spoolToDisk(
      streamOf([[1, 2], [3]]),
      'job1',
      dir,
    );
    expect(file.size).toBe(3);
    expect([...files.keys()]).toEqual(['mirror-job1']);
    await cleanup();
    expect(files.size).toBe(0);
  });

  test('removes the partial file when the download fails', async () => {
    const { files, dir } = fakeDirectory();
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.error(new Error('network dropped'));
      },
    });
    await expect(spoolToDisk(failing, 'job2', dir)).rejects.toThrow(
      'network dropped',
    );
    expect(files.size).toBe(0);
  });
});

describe('clearSpoolFiles', () => {
  test('deletes leftover spool files and nothing else', async () => {
    const { files, dir } = fakeDirectory([
      'mirror-a',
      'mirror-b',
      'unrelated.bin',
    ]);
    await clearSpoolFiles(dir);
    expect([...files.keys()]).toEqual(['unrelated.bin']);
  });
});
