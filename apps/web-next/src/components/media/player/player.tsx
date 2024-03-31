import { gql } from 'graphql-request';
import {
  type Accessor,
  onCleanup,
  onMount,
  untrack,
  createSignal,
  createEffect,
  Show,
  createResource,
} from 'solid-js';
import type VideoJsPlayer from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import { isServer } from 'solid-js/web';
import {
  MediaRouteRecordViewRangesMutation,
  MediaRouteRecordViewRangesMutationVariables,
} from './__generated__/player';
import Waveform from './waveform';
import type { Optional } from '~/util';
import { getAuthenticatedClient } from '~/util/gql/server';
import { makeCleanupSignal } from '~/util/cleanup-signal';

function serializeTimeRanges(
  ranges: TimeRanges,
): Array<{ start: number; end: number }> {
  const res: ReturnType<typeof serializeTimeRanges> = new Array(ranges.length);

  for (let i = 0; i < ranges.length; i += 1) {
    res[i] = { start: ranges.start(i), end: ranges.end(i) };
  }

  return res;
}

const recordViewRanges = async (
  id: string,
  ranges: ReturnType<typeof serializeTimeRanges>,
  viewId: string | null,
) => {
  'use server';
  const client = await getAuthenticatedClient();

  const res = await client.request<
    MediaRouteRecordViewRangesMutation,
    MediaRouteRecordViewRangesMutationVariables
  >(
    gql`
      mutation MediaRouteRecordViewRanges(
        $id: ShortUuid!
        $ranges: [TimeRange!]!
        $viewId: Uuid
      ) {
        viewId: recordUploadRangesView(
          uploadRecordId: $id
          ranges: $ranges
          viewId: $viewId
        )
      }
    `,
    { id, ranges, viewId },
  );

  return res;
};

export type Props = {
  id: string;
  lengthSeconds: number;
  videoSource?: Optional<string>;
  audioSource?: Optional<string>;
  peaksDatUrl?: Optional<string>;
  peaksJsonUrl?: Optional<string>;
  fluid?: boolean | undefined;
  playAt?: Accessor<number>;
  onTimeUpdate?: (currentTime: number) => unknown;
};

export default function Player(props: Props) {
  let videoRef: HTMLVideoElement;
  let player: VideoJsPlayer;
  const [ready, setReady] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const cleanupSignal = makeCleanupSignal();

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
      const res = await recordViewRanges(
        id,
        serializeTimeRanges(videoRef.played),
        viewId,
      );
      viewId = res.viewId;
    } finally {
      reportRangesTimer = window.setTimeout(reportTimeRanges, 5000);
    }
  }

  let userPaused = false;

  function playWhenHidden() {
    if (document.visibilityState === 'hidden' && !userPaused) {
      try {
        player.play();
      } catch (e) {
        console.warn('Could not play video when hidden', e);
      }
    }
  }

  onMount(async () => {
    if (isServer) {
      return;
    }

    const { default: videojs } = await import('video.js');

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

    player.on('pause', () => {
      userPaused = Boolean(player.userActive());
    });

    player.on('playing', () => {
      userPaused = false;
    });

    player.on('timeupdate', () => {
      const tuCurrentTime = player.currentTime() ?? 0;
      onTimeUpdate?.(tuCurrentTime);
      setCurrentTime(tuCurrentTime);
    });

    player.one('ready', () => {
      setReady(true);
    });

    if (!isServer) {
      document.addEventListener('visibilitychange', playWhenHidden, {
        signal: cleanupSignal,
      });
    }
  });

  createEffect(() => {
    if (ready()) {
      player.currentTime(props.playAt?.());
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
      <video class="video-js" ref={videoRef!} playsinline />
    </div>
  );
}
