import { describe, expect, test } from 'vitest';

import { splitIntoParts } from './transfer';

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
