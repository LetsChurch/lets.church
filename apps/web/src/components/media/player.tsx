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
  let videoRef: HTMLVideoElement;
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

  return (
    <div>
      <Show when={audioOnlyMode()}>
        <Waveform
          peaks={peaksData.latest}
          currentTime={currentTime()}
          lengthSeconds={props.lengthSeconds}
          class="mb-2"
          onSeek={(time) => void (videoRef.currentTime = time)}
        />
      </Show>
      <video
        class={cn('w-full', audioOnlyMode() && 'h-[40px]')}
        ref={(el) => void (videoRef = el)}
        playsinline
        controls
      />
    </div>
  );
}
