import { decode as decodeBlurhash } from 'blurhash';

export type Message = { idx: number } & (
  | { type: 'request'; hash: string; width: number; height: number }
  | { type: 'response'; pixels: Uint8ClampedArray }
);

addEventListener('message', (message: MessageEvent<Message>) => {
  if (message.data.type === 'request') {
    const { idx, hash, width, height } = message.data;
    const pixels = decodeBlurhash(hash, width, height);
    postMessage({ type: 'response', idx, pixels } as Message);
  }
});
