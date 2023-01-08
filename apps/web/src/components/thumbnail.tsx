import { createEffect, createSignal, Match, onMount, Switch } from 'solid-js';
import { decode } from 'blurhash';

export type Props = {
  blurhash?: string | null | undefined;
  url?: string | null | undefined;
  width: number;
  height: number;
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
          class="bg-gray-100"
          style={{ width: `${props.width}px`, height: `${props.height}px` }}
        />
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
