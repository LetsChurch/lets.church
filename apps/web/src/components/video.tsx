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

    const audioOnlyMode = !props.videoSource;

    if (audioOnlyMode) {
      invariant(peaksContainer, 'Peaks container ref is undefined');
      invariant(props.peaksDatUrl, 'Peaks source is undefined');
      invariant(props.peaksJsonUrl, 'Peaks source is undefined');

      const { default: Peaks } = await import('peaks.js');

      Peaks.init({
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
      });
    }

    player = videojs(
      videoRef,
      {
        controls: true,
        audioOnlyMode,
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
    <div class="[&_.video-js_.vjs-progress-control]:hidden [&_.video-js_.vjs-time-control]:ml-auto">
      <div class="h-36" ref={(el) => void (peaksContainer = el)} />
      <video class="video-js" ref={(el) => void (videoRef = el)} playsinline />
    </div>
  );
}
