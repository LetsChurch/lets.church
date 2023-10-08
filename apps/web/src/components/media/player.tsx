import { gql } from 'graphql-request';
import {
  type Accessor,
  onMount,
  untrack,
  createSignal,
  createEffect,
  Show,
  createResource,
  onCleanup,
} from 'solid-js';
import server$ from 'solid-start/server';
import invariant from 'tiny-invariant';
import Hls from 'hls.js';
import { isServer } from 'solid-js/web';
import IconPlayerPlay from '@tabler/icons/player-play.svg?component-solid';
import IconPlayerPause from '@tabler/icons/player-pause.svg?component-solid';
import IconMaximize from '@tabler/icons/maximize.svg?component-solid';
import formatDuration from 'format-duration';
import {
  MediaRouteRecordViewRangesMutation,
  MediaRouteRecordViewRangesMutationVariables,
} from './__generated__/player';
import Waveform from './waveform';
import { cn, type Optional } from '~/util';
import { createAuthenticatedClient } from '~/util/gql/server';

const HLS_MIME = 'application/x-mpegURL';
// const HLS_MIME = 'application/vnd.apple.mpegURL';

export function serializeTimeRanges(
  ranges: TimeRanges,
): Array<{ start: number; end: number }> {
  const res: ReturnType<typeof serializeTimeRanges> = new Array(ranges.length);

  for (let i = 0; i < ranges.length; i += 1) {
    res[i] = { start: ranges.start(i), end: ranges.end(i) };
  }

  return res;
}

const recordViewRanges = server$(
  async (
    id: string,
    ranges: ReturnType<typeof serializeTimeRanges>,
    viewId: string | null,
  ) => {
    const client = await createAuthenticatedClient(server$.request);

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
  },
);

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
  let rootRef: HTMLDivElement;
  let videoRef: HTMLVideoElement;
  const [hasPlayed, setHasPlayed] = createSignal(false);
  const [playingState, setPlayingState] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);

  const audioOnlyMode = () =>
    Boolean(
      !props.videoSource &&
        props.audioSource &&
        (props.peaksDatUrl || props.peaksJsonUrl),
    );

  let hls: Hls | null = null;

  function startVideo() {
    invariant(videoRef, 'Video ref is undefined');
    videoRef.currentTime = untrack(() => props.playAt?.() ?? 0);
    videoRef.play();
  }

  const id = untrack(() => props.id);
  let reportRangesTimer: number | undefined = undefined;
  let viewId: string | null = null;

  async function reportTimeRanges() {
    if (isServer) {
      return;
    }

    try {
      invariant(videoRef, 'reportTimeRanges: videoRef is undefined');
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

  onMount(async () => {
    invariant(videoRef, 'Video ref is undefined');
    reportRangesTimer = window.setTimeout(reportTimeRanges, 5000);

    const src = props.videoSource ?? props.audioSource;

    if (!src) {
      console.log('Error! No source!');
      // TODO: show error, offer download
      return;
    }

    if (videoRef.canPlayType(HLS_MIME)) {
      videoRef.src = src;
      videoRef.addEventListener('canplay', function () {
        startVideo();
      });
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(videoRef);
      hls.on(Hls.Events.MEDIA_ATTACHED, function () {
        startVideo();
      });
    } else {
      console.log('Error! Cannot play video.');
      // TODO: show error, offer download
      return;
    }

    const onTimeUpdate = untrack(() => props.onTimeUpdate);

    videoRef.addEventListener('timeupdate', () => {
      const tuCurrentTime = videoRef.currentTime ?? 0;
      onTimeUpdate?.(tuCurrentTime);
      setCurrentTime(tuCurrentTime);
    });

    videoRef.addEventListener('play', () => {
      setHasPlayed(true);
      setPlayingState(true);
    });

    videoRef.addEventListener('pause', () => {
      setPlayingState(false);
    });
  });

  onCleanup(() => {
    hls?.destroy();
    clearTimeout(reportRangesTimer);
    reportTimeRanges();
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

  function handleTogglePlay() {
    if (playingState()) {
      setPlayingState(false);
      videoRef.pause();
    } else {
      setPlayingState(true);
      videoRef.play();
    }
  }

  return (
    <div
      class="group relative flex items-center"
      ref={(el) => void (rootRef = el)}
    >
      <Show when={audioOnlyMode()}>
        <Waveform
          peaks={peaksData.latest}
          currentTime={currentTime()}
          lengthSeconds={props.lengthSeconds}
          class="mb-10 w-full"
          onSeek={(time) => void (videoRef.currentTime = time)}
        />
      </Show>
      <video
        class={cn('cursor-pointer', audioOnlyMode() && 'hidden')}
        ref={(el) => void (videoRef = el)}
        playsinline
        controls={false}
        onClick={handleTogglePlay}
      />
      <div
        class={cn(
          hasPlayed() && !audioOnlyMode() && 'opacity-0',
          'absolute inset-x-0 bottom-0 flex h-8 items-center gap-2 bg-black/75 px-2 text-white transition-opacity group-hover:opacity-100',
        )}
      >
        <button class="shrink" onClick={handleTogglePlay}>
          <Show when={playingState()} fallback={<IconPlayerPlay />}>
            <IconPlayerPause />
          </Show>
        </button>
        <div
          role="progressbar"
          class="h-2 grow cursor-pointer rounded-sm bg-white/30"
          aria-valuemin={0}
          aria-valuemax={props.lengthSeconds}
          aria-valuenow={currentTime()}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            videoRef.currentTime = percentage * props.lengthSeconds;
          }}
        >
          <div
            class="h-2 grow rounded-sm bg-white"
            style={{ width: `${(currentTime() / props.lengthSeconds) * 100}%` }}
          />
        </div>
        <div class="shrink font-mono">
          {formatDuration(currentTime() * 1000)}/
          {formatDuration(props.lengthSeconds * 1000)}
        </div>
        <Show when={!audioOnlyMode()}>
          <button
            class="shrink"
            onClick={() => void rootRef.requestFullscreen()}
          >
            <IconMaximize />
          </button>
        </Show>
      </div>
    </div>
  );
}
