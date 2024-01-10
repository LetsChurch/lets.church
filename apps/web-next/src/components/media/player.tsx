import {
  onCleanup,
  onMount,
  untrack,
  createSignal,
  createEffect,
  Show,
  createResource,
} from 'solid-js';
import invariant from 'tiny-invariant';
import videojs from 'video.js';
import { isServer } from 'solid-js/web';
import type { Optional } from '../../util';
import Waveform from './waveform';
import { setCurrentTime, currentTime, getStartAt, seekTime } from './signals';

function serializeTimeRanges(
  ranges: TimeRanges,
): Array<{ start: number; end: number }> {
  const res: ReturnType<typeof serializeTimeRanges> = new Array(ranges.length);

  for (let i = 0; i < ranges.length; i += 1) {
    res[i] = { start: ranges.start(i), end: ranges.end(i) };
  }

  return res;
}

export type Props = {
  id: string;
  lengthSeconds: number;
  videoSource?: Optional<string>;
  audioSource?: Optional<string>;
  peaksDatUrl?: Optional<string>;
  peaksJsonUrl?: Optional<string>;
  fluid?: boolean | undefined;
  onTimeUpdate?: (currentTime: number) => unknown;
};

export default function Player(props: Props) {
  let videoRef: HTMLVideoElement;
  let player: ReturnType<typeof videojs>;
  const [ready, setReady] = createSignal(false);

  const audioOnlyMode = () =>
    Boolean(
      !props.videoSource &&
        props.audioSource &&
        (props.peaksDatUrl || props.peaksJsonUrl),
    );

  const id = untrack(() => props.id);
  let reportRangesTimer: number | undefined = undefined;
  let viewId: string | null = null;

  async function reportTimeRanges() {
    if (isServer) {
      return;
    }

    try {
      invariant(videoRef, 'reportTimeRanges: videoRef is undefined');
      const res = await fetch('/api/record-view-ranges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          viewId,
          ranges: serializeTimeRanges(videoRef.played),
        }),
      });
      const json = await res.json();

      if (typeof json.viewid === 'string') {
        viewId = json.viewId;
      }
    } finally {
      reportRangesTimer = window.setTimeout(reportTimeRanges, 5000);
    }
  }

  onMount(async () => {
    invariant(videoRef, 'Video ref is undefined');
    reportRangesTimer = window.setTimeout(reportTimeRanges, 5000);

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

    player = videojs(
      videoRef,
      {
        controls: true,
        audioOnlyMode: audioOnlyMode(),
        preload: 'auto',
        fluid: props.fluid,
        sources,
        playbackRates: [1, 1.25, 1.5, 1.75, 2],
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
      const tuCurrentTime = player.currentTime() ?? 0;
      onTimeUpdate?.(tuCurrentTime);
      setCurrentTime(tuCurrentTime);
    });

    player.one('ready', () => {
      setReady(true);
    });
  });

  createEffect(() => {
    if (ready()) {
      player.currentTime(getStartAt() ?? 0);
    }
  });

  onCleanup(() => {
    clearTimeout(reportRangesTimer);
    reportTimeRanges();
    player?.dispose();
  });

  const [peaksData, { refetch: fetchPeaks }] = createResource(
    // eslint-disable-next-line solid/reactivity
    async () => {
      if (!props.peaksJsonUrl) {
        return [];
      }

      const res = await fetch(props.peaksJsonUrl);
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    },
    { initialValue: [] },
  );

  createEffect(() => {
    fetchPeaks();
  });

  let seeks = 0;

  createEffect(() => {
    const seekTo = seekTime();
    seeks += 1;

    if (seeks > 1) {
      player.currentTime(seekTo);
    }
  });

  return (
    <div>
      <Show when={audioOnlyMode()}>
        <Waveform
          peaks={peaksData.latest}
          currentTime={currentTime()}
          lengthSeconds={props.lengthSeconds}
          class="mb-2"
          onSeek={(time) => player.currentTime(time)}
        />
      </Show>
      <video class="video-js" ref={(el) => void (videoRef = el)} playsinline />
    </div>
  );
}
