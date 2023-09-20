import delay from 'delay';
import {
  type Accessor,
  onCleanup,
  onMount,
  untrack,
  createSignal,
  createEffect,
  Show,
} from 'solid-js';
import invariant from 'tiny-invariant';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import type { Optional } from '~/util';

export type Props = {
  videoSource?: Optional<string>;
  audioSource?: Optional<string>;
  peaksDatUrl?: Optional<string>;
  peaksJsonUrl?: Optional<string>;
  fluid?: boolean | undefined;
  playAt?: Accessor<number>;
  onTimeUpdate?: (currentTime: number) => unknown;
};

export default function Video(props: Props) {
  let videoRef: HTMLVideoElement;
  let peaksContainer: HTMLDivElement;
  let player: ReturnType<typeof videojs>;
  const [ready, setReady] = createSignal(false);

  const audioOnlyMode = () =>
    Boolean(
      !props.videoSource &&
        props.audioSource &&
        (props.peaksDatUrl || props.peaksJsonUrl),
    );

  onMount(async () => {
    invariant(videoRef, 'Video ref is undefined');

    const sources = [];

    if (props.videoSource) {
      sources.push({
        src: props.videoSource,
        type: 'application/x-mpegURL',
      });
    }

    if (props.audioSource) {
      sources.push({
        src: props.audioSource,
        type: 'application/x-mpegURL',
      });
    }

    if (audioOnlyMode()) {
      invariant(peaksContainer, 'Peaks container ref is undefined');
      invariant(props.peaksDatUrl, 'Peaks source is undefined');
      invariant(props.peaksJsonUrl, 'Peaks source is undefined');

      const { default: Peaks } = await import('peaks.js');

      // Hack to work around peaks container not having width/height yet
      while (
        peaksContainer.clientWidth <= 0 ||
        peaksContainer.clientHeight <= 0
      ) {
        await delay(10);
      }

      Peaks.init(
        {
          mediaElement: videoRef,
          overview: {
            container: peaksContainer,
            waveformColor: '#818cf8',
            playedWaveformColor: '#6366f1', // indigo-500
            showPlayheadTime: false,
            showAxisLabels: false,
            axisGridlineColor: 'transparent',
          },
          dataUri: {
            arraybuffer: props.peaksDatUrl,
            json: props.peaksJsonUrl,
          },
          keyboard: true,
        },
        (err) => {
          if (err) {
            console.log(err);
          }
        },
      );
    }

    player = videojs(
      videoRef,
      {
        controls: true,
        audioOnlyMode: audioOnlyMode(),
        preload: 'auto',
        fluid: props.fluid,
        sources,
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
      const time = player.currentTime();
      if (typeof time !== 'undefined') {
        onTimeUpdate?.(time);
      }
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
    <div>
      <Show when={audioOnlyMode()}>
        <div class="h-36" ref={(el) => void (peaksContainer = el)} />
      </Show>
      <video class="video-js" ref={(el) => void (videoRef = el)} playsinline />
    </div>
  );
}
