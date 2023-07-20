import UnknownIcon from '@tabler/icons/3d-cube-sphere.svg?component-solid';
import VideoIcon from '@tabler/icons/video.svg?component-solid';
import AudioIcon from '@tabler/icons/volume.svg?component-solid';
import { createEffect, createSignal, Match, onMount, Switch } from 'solid-js';
import { isServer } from 'solid-js/web';
import type { Message } from './blurhash-worker';
import type { Optional } from '~/util';

export type Props = {
  blurhash?: Optional<string>;
  url?: Optional<string>;
  width: number;
  height: number;
  placeholder?: 'video' | 'audio' | undefined;
};

const blurhashCallbacks = new Map<
  number,
  (pixels: Uint8ClampedArray) => unknown
>();
const blurhashWorker = isServer
  ? null
  : new Worker(new URL('./blurhash-worker.ts', import.meta.url), {
      type: 'module',
    });
let idx = 0;

blurhashWorker?.addEventListener(
  'message',
  (message: MessageEvent<Message>) => {
    if (message.data.type === 'response') {
      const { idx, pixels } = message.data;
      const fn = blurhashCallbacks.get(idx);
      fn?.(pixels);
      blurhashCallbacks.delete(idx);
    }
  },
);

function decodeBlurhash(hash: string, width: number, height: number) {
  return new Promise<Uint8ClampedArray>((resolve) => {
    const i = idx++;
    blurhashCallbacks.set(i, resolve);
    blurhashWorker?.postMessage({
      type: 'request',
      idx: i,
      hash,
      width,
      height,
    } as Message);
  });
}

export default function Thumbnail(props: Props) {
  const [loaded, setLoaded] = createSignal(false);
  let canvas: HTMLCanvasElement | null = null;

  createEffect(() => {
    const url = props.url;
    if (!url) return;
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.src = url;
  });

  onMount(async () => {
    if (!canvas) return;
    const blurhash = props.blurhash;
    if (!blurhash) return;
    const pixels = await decodeBlurhash(blurhash, props.width, props.height);
    const ctx = canvas.getContext('2d');
    const imageData = new ImageData(pixels, props.width, props.height);
    ctx?.putImageData(imageData, 0, 0);
  });

  return (
    <Switch
      fallback={
        <div class="flex aspect-video w-full items-center justify-center bg-gray-100 text-gray-300">
          <Switch
            fallback={
              <UnknownIcon width={props.width / 2} height={props.height / 2} />
            }
          >
            <Match when={props.placeholder === 'video'}>
              <VideoIcon width={props.width / 2} height={props.height / 2} />
            </Match>
            <Match when={props.placeholder === 'audio'}>
              <AudioIcon width={props.width / 2} height={props.height / 2} />
            </Match>
          </Switch>
        </div>
      }
    >
      <Match when={loaded()}>
        <img src={props.url ?? ''} class="w-full" />
      </Match>
      <Match when={props.blurhash}>
        <canvas
          ref={(c) => void (canvas = c)}
          width={props.width}
          height={props.height}
        />
      </Match>
    </Switch>
  );
}
