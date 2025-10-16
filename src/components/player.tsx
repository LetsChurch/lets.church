import { useMutation } from '@tanstack/react-query';
import type { HlsVideoElement } from 'hls-video-element';
import HlsVideo from 'hls-video-element/react';
import {
  MediaController,
  MediaDurationDisplay,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPipButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
} from 'media-chrome/react';
import { useEffect, useRef } from 'react';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number;
  }
}

type Props = {
  uploadRecordId: string;
  viewHash: string;
  mediaSource?: string | null;
  audioSource?: string | null;
  posterThumbnailUrl?: string | null;
  videoWidth: number;
  videoHeight: number;
};

function serializeTimeRanges(
  ranges: TimeRanges,
): Array<{ start: number; end: number }> {
  const res: ReturnType<typeof serializeTimeRanges> = new Array(ranges.length);

  for (let i = 0; i < ranges.length; i += 1) {
    res[i] = { start: ranges.start(i), end: ranges.end(i) };
  }

  return res;
}

export function Player({
  uploadRecordId,
  viewHash,
  mediaSource,
  audioSource,
  posterThumbnailUrl,
  videoWidth,
  videoHeight,
}: Props) {
  const trpc = useTRPC();
  const videoRef = useRef<HlsVideoElement>(null);
  const reportTimerRef = useRef<number | undefined>(undefined);

  const recordViewSecondsMutation = useMutation(
    trpc.media.recordViewSeconds.mutationOptions(),
  );
  const { mutateAsync: recordViewSeconds } = recordViewSecondsMutation;

  useEffect(() => {
    if (!videoRef.current || !viewHash) {
      return;
    }

    async function reportTimeRanges() {
      if (!videoRef.current) {
        return;
      }

      try {
        const ranges = serializeTimeRanges(videoRef.current.played);
        if (ranges.length > 0) {
          await recordViewSeconds({
            uploadRecordId,
            viewHash,
            ranges,
          });
        }
      } catch (error) {
        console.error('[Player] Error recording view seconds', error);
      } finally {
        reportTimerRef.current = window.setTimeout(reportTimeRanges, 5000);
      }
    }

    // Start the reporting timer
    reportTimerRef.current = window.setTimeout(reportTimeRanges, 5000);

    // Cleanup
    return () => {
      clearTimeout(reportTimerRef.current);
      // Report one final time on unmount
      if (videoRef.current) {
        const ranges = serializeTimeRanges(videoRef.current.played);
        if (ranges.length > 0) {
          recordViewSeconds({
            uploadRecordId,
            viewHash,
            ranges,
          }).catch((error) => {
            console.error('[Player] Error recording view seconds', error);
          });
        }
      }
    };
  }, [uploadRecordId, viewHash, recordViewSeconds]);

  return (
    <div className="overflow-hidden rounded-2xl bg-black">
      {mediaSource || audioSource ? (
        <MediaController
          className="relative block"
          style={{
            width: `${videoWidth}px`,
            height: `${videoHeight}px`,
          }}
        >
          <HlsVideo
            ref={videoRef}
            slot="media"
            preload="metadata"
            src={mediaSource || audioSource || undefined}
            poster={posterThumbnailUrl || undefined}
            playsInline
          />

          <div className="absolute inset-0 flex flex-col">
            <div className="flex h-16 justify-between bg-gradient-to-b from-gray-950/70 to-transparent px-3 pt-3">
              <div className="text-white">left</div>
              <div className="flex items-start gap-2.5">
                <MediaMuteButton
                  tooltipPlacement="bottom"
                  className="size-7 rounded-lg border-top-highlight bg-transparent p-1 backdrop-blur-lg"
                />
                <MediaPlaybackRateButton
                  tooltipPlacement="bottom"
                  className="size-7 rounded-lg border-top-highlight bg-transparent p-1 backdrop-blur-lg"
                />
                <MediaPipButton
                  tooltipPlacement="bottom"
                  className="size-7 rounded-lg border-top-highlight bg-transparent p-1 backdrop-blur-lg"
                />
                <MediaFullscreenButton
                  tooltipPlacement="bottom"
                  className="size-7 rounded-lg border-top-highlight bg-transparent p-1 backdrop-blur-lg"
                />
              </div>
            </div>

            <div className="flex grow items-center justify-center gap-6">
              <MediaSeekBackwardButton
                seekOffset={15}
                className="size-8 rounded-lg border-top-highlight backdrop-blur-lg"
              />
              <MediaPlayButton className="size-12 rounded-lg border-top-highlight bg-transparent backdrop-blur-lg" />
              <MediaSeekForwardButton
                seekOffset={15}
                className="size-8 rounded-lg border-top-highlight bg-transparent backdrop-blur-lg"
              />
            </div>

            <div className="flex h-16 flex-col gap-1 bg-gradient-to-t from-gray-950/70 to-transparent px-4 pb-4">
              <div className="flex justify-between font-mono font-normal text-[10px] text-white tracking-[-0.2px]">
                <MediaTimeDisplay
                  className="bg-transparent"
                  showDuration={false}
                />
                <MediaDurationDisplay className="bg-transparent" />
              </div>

              {/* border-radius: 6px; */}
              {/* background: linear-gradient(45deg, var(--indigo-5000, rgba(99, 102, 241, 0.00)) 50.08%, var(--Indigo-300, #A5B4FC) 100%), var(--indigo-500, #6366F1); */}
              {/* box-shadow: 0 1px 6px 0 rgba(0, 0, 0, 0.50), 0 2px 12px 0 var(--indigo-500, #6366F1); */}
              {/* backdrop-filter: blur(4px); */}

              <MediaTimeRange
                className={cn(
                  '[--media-range-bar-color:--alpha(var(--color-indigo-500)/60%)]',
                  '[--media-range-track-background:--alpha(var(--color-white)/20%)]',
                  '[--media-range-thumb-background:linear-gradient(45deg,--alpha(var(--color-indigo-500)/0%)_50%,var(--color-indigo-300)_100%),var(--color-indigo-500)]',
                  '[--media-range-thumb-box-shadow:0_1px_6px_0_--alpha(var(--color-black)/50%),0_2px_12px_0_var(--color-indigo-500)]',
                )}
                style={{
                  width: '100%',
                  height: '3px',
                  background: 'none',
                  '--media-range-track-border-radius': '3px',
                  // '--media-range-thumb-background':
                  //   'linear-gradient(45deg, rgba(99, 102, 241, 0) 50%, rgb(165, 180, 252) 100%), linear-gradient(90deg, rgb(99, 102, 241) 0%, rgb(99, 102, 241) 100%)',
                  '--media-range-thumb-width': '7px',
                  '--media-range-thumb-height': '7px',
                  '--media-range-thumb-border-radius': '6px',
                }}
              />
            </div>
          </div>
        </MediaController>
      ) : (
        <div className="flex size-full items-center justify-center">
          <p className="text-sm text-zinc-400">No media available</p>
        </div>
      )}
    </div>
  );
}
