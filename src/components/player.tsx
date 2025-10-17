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
import { useEffect, useRef, useState } from 'react';
import { MediaSwitcher } from '@/components/media-switcher';
import { WaveformBackground } from '@/components/waveform-background';
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
  peaksJsonUrl?: string | null;
  lengthSeconds?: number | null;
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
  peaksJsonUrl,
  lengthSeconds,
}: Props) {
  const trpc = useTRPC();
  const videoRef = useRef<HlsVideoElement>(null);
  const reportTimerRef = useRef<number | undefined>(undefined);

  const hasVideo = !!mediaSource;
  const hasAudio = !!audioSource;
  const showToggle = hasVideo && hasAudio;

  const [mediaType, setMediaType] = useState<'video' | 'audio'>(
    hasVideo ? 'video' : 'audio',
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [savedPosition, setSavedPosition] = useState(0);
  const [savedPlayState, setSavedPlayState] = useState(false);

  const recordViewSecondsMutation = useMutation(
    trpc.media.recordViewSeconds.mutationOptions(),
  );
  const { mutateAsync: recordViewSeconds } = recordViewSecondsMutation;

  const currentSource = mediaType === 'video' ? mediaSource : audioSource;

  // Restore position and play state when source changes
  // TODO: can this be done with renditions?
  useEffect(() => {
    if (!videoRef.current || savedPosition === 0) {
      return;
    }

    const videoElement = videoRef.current;

    const handleLoadedMetadata = () => {
      videoElement.currentTime = savedPosition;
      if (savedPlayState) {
        videoElement.play().catch((error) => {
          console.error('[Player] Error resuming playback', error);
        });
      }
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [savedPosition, savedPlayState]);

  useEffect(() => {
    if (!videoRef.current || !viewHash) {
      return;
    }

    const videoElement = videoRef.current;

    const handleTimeUpdate = () => {
      if (videoElement) {
        setCurrentTime(videoElement.currentTime);
      }
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);

    async function reportTimeRanges() {
      if (!videoElement) {
        return;
      }

      try {
        const ranges = serializeTimeRanges(videoElement.played);
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
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      // Report one final time on unmount
      if (videoElement) {
        const ranges = serializeTimeRanges(videoElement.played);
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
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl',
        mediaType === 'video' && 'bg-black',
      )}
    >
      {currentSource ? (
        <>
          {mediaType === 'audio' && (
            <WaveformBackground
              peaksJsonUrl={peaksJsonUrl}
              currentTime={currentTime}
              lengthSeconds={lengthSeconds ?? undefined}
            />
          )}
          <MediaController
            className="relative block"
            style={{
              '--media-background-color': 'none',
              width: mediaType === 'audio' ? '100%' : `${videoWidth}px`,
              height: mediaType === 'audio' ? '240px' : `${videoHeight}px`,
            }}
            autohide={mediaType === 'audio' ? '-1' : '2'}
          >
            <HlsVideo
              ref={videoRef}
              slot="media"
              preload="metadata"
              src={currentSource}
              poster={
                mediaType === 'video'
                  ? posterThumbnailUrl || undefined
                  : undefined
              }
              playsInline
              className={
                mediaType === 'video'
                  ? 'bg-black'
                  : 'bg-gradient-to-t from-gray-900 to-50% to-gray-900/0'
              }
            />

            <div className="pointer-events-none absolute inset-0 flex flex-col">
              <div
                className={cn(
                  'pointer-events-auto flex h-16 px-3 pt-3',
                  showToggle ? 'justify-between' : 'justify-end',
                  mediaType === 'video' &&
                    'bg-gradient-to-b from-gray-950/70 to-transparent',
                )}
              >
                {showToggle ? (
                  <MediaSwitcher
                    value={mediaType}
                    onValueChange={(value) => {
                      if (value && videoRef.current) {
                        // Save current position and play state
                        setSavedPosition(videoRef.current.currentTime);
                        setSavedPlayState(!videoRef.current.paused);
                        setMediaType(value);
                      }
                    }}
                  />
                ) : null}
                <div className="flex items-start gap-2.5">
                  <MediaMuteButton
                    tooltipPlacement="bottom"
                    className={cn(
                      'size-7 rounded-lg border-top-highlight bg-transparent p-1 backdrop-blur-lg',
                      mediaType === 'audio' && 'bg-white/10',
                    )}
                  />
                  <MediaPlaybackRateButton
                    tooltipPlacement="bottom"
                    className={cn(
                      'size-7 rounded-lg border-top-highlight bg-transparent p-1 backdrop-blur-lg',
                      mediaType === 'audio' && 'bg-white/10',
                    )}
                  />
                  <MediaPipButton
                    tooltipPlacement="bottom"
                    className={cn(
                      'size-7 rounded-lg border-top-highlight bg-transparent p-1 backdrop-blur-lg',
                      mediaType === 'audio' && 'bg-white/10',
                    )}
                  />
                  <MediaFullscreenButton
                    tooltipPlacement="bottom"
                    className={cn(
                      'size-7 rounded-lg border-top-highlight bg-transparent p-1 backdrop-blur-lg',
                      mediaType === 'audio' && 'bg-white/10',
                    )}
                  />
                </div>
              </div>

              <div className="pointer-events-auto flex grow items-center justify-center gap-6">
                <MediaSeekBackwardButton
                  seekOffset={15}
                  className={cn(
                    'size-8 rounded-lg border-top-highlight backdrop-blur-lg',
                    mediaType === 'audio' && 'bg-white/10',
                  )}
                />
                <MediaPlayButton
                  className={cn(
                    'size-12 rounded-lg border-top-highlight bg-transparent backdrop-blur-lg',
                    mediaType === 'audio' && 'bg-white/10',
                  )}
                />
                <MediaSeekForwardButton
                  seekOffset={15}
                  className={cn(
                    'size-8 rounded-lg border-top-highlight bg-transparent backdrop-blur-lg',
                    mediaType === 'audio' && 'bg-white/10',
                  )}
                />
              </div>

              <div
                className={cn(
                  'pointer-events-auto flex h-16 flex-col justify-end gap-1 px-4 pb-4',
                  mediaType === 'video' &&
                    'bg-gradient-to-t from-gray-950/70 to-transparent',
                )}
              >
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
        </>
      ) : (
        <div className="flex size-full items-center justify-center">
          <p className="text-sm text-zinc-400">No media available</p>
        </div>
      )}
    </div>
  );
}
