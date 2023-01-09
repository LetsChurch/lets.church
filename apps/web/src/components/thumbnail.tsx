import UnknownIcon from '@tabler/icons/3d-cube-sphere.svg?component-solid';
import VideoIcon from '@tabler/icons/video.svg?component-solid';
import AudioIcon from '@tabler/icons/volume.svg?component-solid';
import { createEffect, createSignal, Match, onMount, Switch } from 'solid-js';
import { decode } from 'blurhash';

export type Props = {
  blurhash?: string | null | undefined;
  url?: string | null | undefined;
  width: number;
  height: number;
  placeholder?: 'video' | 'audio' | undefined;
};

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

  onMount(() => {
    console.log(canvas, props.blurhash);
    if (!canvas) return;
    const blurhash = props.blurhash;
    if (!blurhash) return;
    const pixels = decode(blurhash, props.width, props.height);
    const ctx = canvas.getContext('2d');
    const imageData = new ImageData(pixels, props.width, props.height);
    ctx?.putImageData(imageData, 0, 0);
  });

  return (
    <Switch
      fallback={
        <div
          class="flex items-center justify-center bg-gray-100 text-gray-300"
          style={{ width: `${props.width}px`, height: `${props.height}px` }}
        >
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
        <img src={props.url ?? ''} width={props.width} height={props.height} />
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
