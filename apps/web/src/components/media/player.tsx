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
import server$ from 'solid-start/server';
import invariant from 'tiny-invariant';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import {
  MediaRouteRecordUploadSegmentViewMutation,
  MediaRouteRecordUploadSegmentViewMutationVariables,
} from './__generated__/player';
import Waveform from './waveform';
import type { Optional } from '~/util';
import { createAuthenticatedClient } from '~/util/gql/server';

const recordSegmentView = server$(
  async (id: string, start: number, end: number) => {
    const client = await createAuthenticatedClient(server$.request);

    const res = await client.request<
      MediaRouteRecordUploadSegmentViewMutation,
      MediaRouteRecordUploadSegmentViewMutationVariables
    >(
      gql`
        mutation MediaRouteRecordUploadSegmentView(
          $id: ShortUuid!
          $start: Float!
          $end: Float!
        ) {
          recordUploadSegmentView(
            uploadRecordId: $id
            segmentStartTime: $start
            segmentEndTime: $end
          )
        }
      `,
      { id, start, end },
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
  let player: ReturnType<typeof videojs>;
  const [ready, setReady] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);

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

    const id = untrack(() => props.id);
    let segmentStartTime = 0;
    let segmentEndTime = 0;

    player.on('pause', () => {
      const currentTime = player.currentTime() ?? 0;
      recordSegmentView(id, segmentStartTime, segmentEndTime);
      segmentStartTime = currentTime;
      segmentEndTime = currentTime;
    });

    player.on('timeupdate', () => {
      const tuCurrentTime = player.currentTime() ?? 0;

      if (Math.abs(tuCurrentTime - segmentStartTime) >= 5) {
        // If the current time is 5 seconds or more than the segment start time, this is a seek, record a segment view
        recordSegmentView(id, segmentStartTime, segmentEndTime);
        segmentStartTime = tuCurrentTime;
      }

      // Always update the current segment end time
      segmentEndTime = tuCurrentTime;

      if (segmentEndTime - segmentStartTime >= 5) {
        // If the current segment is more than 5 seconds long, record a segment view
        recordSegmentView(id, segmentStartTime, tuCurrentTime);
        segmentStartTime = tuCurrentTime;
      }

      onTimeUpdate?.(tuCurrentTime);
      setCurrentTime(tuCurrentTime);
    });

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
          class="mb-8"
          onSeek={(time) => player.currentTime(time)}
        />
      </Show>
      <video class="video-js" ref={(el) => void (videoRef = el)} playsinline />
    </div>
  );
}
