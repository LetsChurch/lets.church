import { onCleanup, onMount, untrack } from 'solid-js';
import invariant from 'tiny-invariant';
import videojs, { VideoJsPlayer } from 'video.js';
import 'video.js/dist/video-js.css';

export type Props = {
  source: string;
  fluid?: boolean | undefined;
  startAt?: number | undefined;
  onTimeUpdate?: (currentTime: number) => unknown;
};

export default function Video(props: Props) {
  let videoRef: HTMLVideoElement;
  let player: VideoJsPlayer;

  onMount(() => {
    invariant(videoRef, 'Video ref is undefined');

    const startAt = untrack(() => props.startAt);

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

    player.on('timeupdate', () => {
      onTimeUpdate?.(player.currentTime());
    });

    player.one('play', () => {
      if (typeof startAt === 'number') {
        player.currentTime(startAt);
      }
    });
  });

  onCleanup(() => {
    player?.dispose();
  });

  return (
    <video class="video-js" ref={(el) => void (videoRef = el)} playsinline />
  );
}
