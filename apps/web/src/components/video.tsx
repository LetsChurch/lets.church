import {
  type Accessor,
  onCleanup,
  onMount,
  untrack,
  createSignal,
  createEffect,
} from 'solid-js';
import invariant from 'tiny-invariant';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export type Props = {
  source: string;
  fluid?: boolean | undefined;
  playAt?: Accessor<number>;
  onTimeUpdate?: (currentTime: number) => unknown;
};

export default function Video(props: Props) {
  let videoRef: HTMLVideoElement;
  let player: ReturnType<typeof videojs>;
  const [ready, setReady] = createSignal(false);

  onMount(() => {
    invariant(videoRef, 'Video ref is undefined');

    player = videojs(
      videoRef,
      {
        controls: true,
        preload: 'auto',
        fluid: props.fluid,
        sources: [
          {
            src: props.source,
            type: 'application/x-mpegURL',
          },
        ],
        html5: {
          hls: {
            overrideNative: false,
          },
          nativeVideoTracks: true,
          nativeAudioTracks: true,
          nativeTextTracks: true,
        },
      },
      async () => {
        try {
          await player.play();
        } catch (e) {
          // The play method is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.
          console.warn('Could not automatically play video', e);
        }
      },
    );

    const onTimeUpdate = untrack(() => props.onTimeUpdate);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: https://github.com/videojs/video.js/issues/8178
    player.on('timeupdate', () => {
      onTimeUpdate?.(player.currentTime());
    });

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: https://github.com/videojs/video.js/issues/8178
    player.one('ready', () => {
      setReady(true);
    });
  });

  createEffect(() => {
    if (ready()) {
      player.currentTime(props.playAt?.());
    }
  });

  onCleanup(() => {
    player?.dispose();
  });

  return (
    <video class="video-js" ref={(el) => void (videoRef = el)} playsinline />
  );
}
