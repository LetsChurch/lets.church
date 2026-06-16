import { useStore } from '@nanostores/react';
import { IconRewindBackward10, IconRewindForward10 } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type { HlsVideoElement } from 'hls-video-element';
import { Hls } from 'hls-video-element';
import HlsVideo from 'hls-video-element/react';
import type { MediaController as MediaControllerElement } from 'media-chrome';
import {
  MediaController,
  MediaDurationDisplay,
  MediaFullscreenButton,
  MediaLiveButton,
  MediaMuteButton,
  MediaPipButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
} from 'media-chrome/react';
import posthog from 'posthog-js';
import { useEffect, useRef, useState } from 'react';
import { LcTooltip } from '@/components/lc-tooltip';
import Logo from '@/components/logo';
import { MediaSwitcher } from '@/components/media-switcher';
import { WaveformBackground } from '@/components/waveform-background';
import { $currentTime, $setPlayAt } from '@/stores/player';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { stopMediaElement } from '@/util/stop-media-element';

declare module 'react' {
  // biome-ignore lint/style/useConsistentTypeDefinitions: external interface
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
  videoClassName?: string | null;
  embed?: boolean;
  initialTimestamp?: number;
  onVideoEnded?: () => void;
  // True while this is a live broadcast streaming from Mux's live HLS. Shows a
  // LIVE badge and disables the VOD-only view-range tracking.
  isLive?: boolean;
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
  videoClassName,
  embed = false,
  initialTimestamp,
  onVideoEnded,
  isLive = false,
}: Props) {
  const trpc = useTRPC();
  const videoRef = useRef<HlsVideoElement>(null);
  const controllerRef = useRef<MediaControllerElement>(null);
  const reportTimerRef = useRef<number | undefined>(undefined);
  const currentTime = useStore($currentTime);
  const [elementDuration, setElementDuration] = useState<number>(0);

  const hasVideo = !!mediaSource;
  const hasAudio = !!audioSource;
  const showToggle = hasVideo && hasAudio && !embed;

  const [mediaType, setMediaType] = useState<'video' | 'audio'>(
    hasVideo ? 'video' : 'audio',
  );

  const [savedPosition, setSavedPosition] = useState(0);
  const [savedPlayState, setSavedPlayState] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<{
    direction: 'forward' | 'backward';
    visible: boolean;
  } | null>(null);
  const seekFeedbackTimeoutRef = useRef<number | undefined>(undefined);
  // Track if we auto-switched to audio due to page being backgrounded
  const autoSwitchedToAudioRef = useRef(false);

  const recordViewSecondsMutation = useMutation(
    trpc.media.recordViewSeconds.mutationOptions(),
  );
  const { mutateAsync: recordViewSeconds } = recordViewSecondsMutation;

  const currentSource = mediaType === 'video' ? mediaSource : audioSource;

  // For audio mode, ensure controls are visible on mount by triggering user activity
  useEffect(() => {
    if (mediaType === 'audio' && controllerRef.current) {
      // Dispatch a pointermove event to trigger activity detection
      // This ensures controls are visible immediately for audio-only content
      controllerRef.current.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true }),
      );
    }
  }, [mediaType]);

  // Tell media-chrome whether this is a live (DVR) stream so the controls
  // render the live timeline / DVR window and the live button works, instead
  // of a fixed-duration on-demand timeline (which jumps as the edge advances).
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setAttribute('streamtype', isLive ? 'live' : 'on-demand');
  }, [isLive]);

  // Fully tear down the underlying media element when the player unmounts, so a
  // detached element can't keep emitting audio. Custom-element media players
  // don't stop playback on disconnect, and hls-video-element defers autoplay to
  // hls.js's MANIFEST_PARSED — which can fire *after* a fast unmount and start a
  // detached, unpausable stream. See stopMediaElement. Mirrors the mini-player.
  useEffect(() => {
    const el = videoRef.current;
    return () => {
      stopMediaElement(el);
    };
  }, []);

  // Keyboard shortcuts for media controls
  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    const videoElement = videoRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const showSeekFeedback = (direction: 'forward' | 'backward') => {
        clearTimeout(seekFeedbackTimeoutRef.current);
        setSeekFeedback({ direction, visible: true });
        seekFeedbackTimeoutRef.current = window.setTimeout(() => {
          setSeekFeedback(null);
        }, 500);
      };

      switch (e.key.toLowerCase()) {
        case 'k':
          if (videoElement.paused) {
            videoElement.play();
          } else {
            videoElement.pause();
          }
          break;
        case 'j':
          videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
          showSeekFeedback('backward');
          break;
        case 'l':
          videoElement.currentTime = Math.min(
            videoElement.duration || 0,
            videoElement.currentTime + 10,
          );
          showSeekFeedback('forward');
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto-switch between video and audio based on page visibility (iOS background playback)
  useEffect(() => {
    // Only enable this feature if both video and audio sources are available
    if (!hasVideo || !hasAudio) return;

    const handleVisibilityChange = () => {
      if (
        document.hidden &&
        mediaType === 'video' &&
        videoRef.current &&
        !videoRef.current.paused
      ) {
        // Page is being backgrounded while video is playing - switch to audio
        setSavedPosition(videoRef.current.currentTime);
        setSavedPlayState(true);
        autoSwitchedToAudioRef.current = true;
        setMediaType('audio');
      } else if (
        !document.hidden &&
        mediaType === 'audio' &&
        autoSwitchedToAudioRef.current
      ) {
        // Page is becoming visible and we previously auto-switched - switch back to video
        if (videoRef.current) {
          setSavedPosition(videoRef.current.currentTime);
          setSavedPlayState(!videoRef.current.paused);
        }
        autoSwitchedToAudioRef.current = false;
        setMediaType('video');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [hasVideo, hasAudio, mediaType]);

  // Media Session API for lock screen controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      videoRef.current?.play();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      videoRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.min(
          videoRef.current.duration || 0,
          videoRef.current.currentTime + 15,
        );
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(
          0,
          videoRef.current.currentTime - 15,
        );
      }
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
    };
  }, []);

  // Seek to initial timestamp from URL hash
  useEffect(() => {
    if (!videoRef.current || initialTimestamp === undefined) {
      return;
    }

    const videoElement = videoRef.current;
    let hasSeekCompleted = false;

    const seekToTimestamp = () => {
      if (hasSeekCompleted) return;

      console.log(`seeking to ${initialTimestamp}`);

      // Check if we can seek (readyState >= HAVE_METADATA)
      if (videoElement.readyState >= 1) {
        videoElement.currentTime = initialTimestamp;
        hasSeekCompleted = true;
      }
    };

    // Try immediately in case metadata is already loaded
    seekToTimestamp();

    // Also listen for these events in case metadata isn't loaded yet
    const ac = new AbortController();
    videoElement.addEventListener('loadedmetadata', seekToTimestamp, ac);

    return () => {
      ac.abort();
    };
  }, [initialTimestamp]);

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

  // Preserve playback position when the source URL swaps underneath us — most
  // importantly the live→VOD handoff, where `mediaSource` changes from Mux's
  // live HLS to our CDN master once the recording is imported. Without this the
  // element reloads and resets to t=0, yanking the viewer back to the start.
  const sourceInitializedRef = useRef(false);
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    // Skip the initial mount (initialTimestamp/savedPosition handle that).
    if (!sourceInitializedRef.current) {
      sourceInitializedRef.current = true;
      return;
    }
    // Captured before the new source loads (currentTime hasn't reset yet).
    const resumeAt = videoElement.currentTime;
    const wasPlaying = !videoElement.paused;
    if (resumeAt <= 0) return;

    const handleLoaded = () => {
      try {
        videoElement.currentTime = resumeAt;
        if (wasPlaying) {
          videoElement.play().catch(() => {});
        }
      } catch {
        // ignore — seeking can throw if the element isn't ready
      }
    };

    videoElement.addEventListener('loadedmetadata', handleLoaded, {
      once: true,
    });
    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoaded);
    };
  }, [currentSource]);

  useEffect(() => {
    if (!videoRef.current || !viewHash) {
      return;
    }

    const videoElement = videoRef.current;

    const handleTimeUpdate = () => {
      $currentTime.set(videoElement.currentTime);
    };

    const handleDurationChange = () => {
      if (videoElement.duration && Number.isFinite(videoElement.duration)) {
        setElementDuration(videoElement.duration);
      }
    };

    const handleEnded = () => {
      onVideoEnded?.();
    };

    const cleanSetPlayAt = $setPlayAt.listen((time) => {
      if (time !== null) {
        videoElement.currentTime = time;
      }
    });

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('durationchange', handleDurationChange);
    videoElement.addEventListener('ended', handleEnded);

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

    // Start the reporting timer (VOD only — live "played" ranges aren't a
    // meaningful watch record, and the live edge keeps moving).
    if (!isLive) {
      reportTimerRef.current = window.setTimeout(reportTimeRanges, 5000);
    }

    // Cleanup
    return () => {
      clearTimeout(reportTimerRef.current);
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('durationchange', handleDurationChange);
      videoElement.removeEventListener('ended', handleEnded);
      cleanSetPlayAt();
      // Report one final time on unmount (VOD only)
      if (!isLive) {
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
  }, [uploadRecordId, viewHash, recordViewSeconds, onVideoEnded, isLive]);

  // Track playback start and streaming resolution in PostHog
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    let hasStarted = false;
    let hlsCleanup: (() => void) | undefined;

    const setupHls = () => {
      if (hlsCleanup || mediaType !== 'video') return;
      const hls = videoElement.api;
      if (!hls) return;

      const onLevelSwitched = (_event: string, data: { level: number }) => {
        const level = hls.levels[data.level];
        if (!level) return;
        posthog.capture('media_quality_changed', {
          upload_record_id: uploadRecordId,
          media_type: 'video',
          height: level.height,
          bitrate: level.bitrate,
        });
      };

      hls.on(Hls.Events.LEVEL_SWITCHED, onLevelSwitched);
      hlsCleanup = () => hls.off(Hls.Events.LEVEL_SWITCHED, onLevelSwitched);
    };

    const onPlay = () => {
      if (hasStarted) return;
      hasStarted = true;
      if (mediaType === 'video') {
        const hls = videoElement.api;
        const idx = hls?.currentLevel ?? -1;
        const level = idx >= 0 ? hls?.levels[idx] : undefined;
        posthog.capture('media_playback_started', {
          upload_record_id: uploadRecordId,
          media_type: 'video',
          ...(level ? { height: level.height, bitrate: level.bitrate } : {}),
        });
      } else {
        posthog.capture('media_playback_started', {
          upload_record_id: uploadRecordId,
          media_type: 'audio',
        });
      }
    };

    const ac = new AbortController();

    setupHls();
    videoElement.addEventListener('canplay', setupHls, { signal: ac.signal });
    videoElement.addEventListener('play', onPlay, { signal: ac.signal });

    return () => {
      ac.abort();
      hlsCleanup?.();
    };
  }, [uploadRecordId, mediaType]);

  return (
    <LcTooltip.Provider>
      <div
        className={cn(
          'relative overflow-hidden',
          !embed && 'rounded-2xl',
          mediaType === 'video' && 'bg-black',
          mediaType === 'video' && videoClassName,
          mediaType === 'audio' && embed && 'w-full',
        )}
      >
        {isLive && currentSource && (
          <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 font-semibold text-white text-xs uppercase tracking-wide group-[[mediaisfullscreen]]:top-6 group-[[mediaisfullscreen]]:left-6">
            <span className="size-2 animate-pulse rounded-full bg-white" />
            Live
          </div>
        )}
        {currentSource ? (
          <>
            {mediaType === 'audio' && (
              <WaveformBackground
                peaksJsonUrl={peaksJsonUrl}
                currentTime={currentTime}
                lengthSeconds={elementDuration || lengthSeconds || undefined}
              />
            )}
            <MediaController
              ref={controllerRef}
              className="group relative block [&[userinactive]:not([mediapaused])]:cursor-none"
              style={{
                '--media-background-color': 'none',
                width:
                  mediaType === 'audio' || embed ? '100%' : `${videoWidth}px`,
                height:
                  mediaType === 'audio' && !embed
                    ? '240px'
                    : embed && mediaType === 'video'
                      ? 'auto'
                      : embed && mediaType === 'audio'
                        ? '100%'
                        : `${videoHeight}px`,
                aspectRatio:
                  embed && mediaType === 'video'
                    ? `${videoWidth} / ${videoHeight}`
                    : undefined,
              }}
              autohide={mediaType === 'audio' ? '-1' : '2'}
            >
              <HlsVideo
                ref={videoRef}
                slot="media"
                // The hls-video custom element manages its own attributes (e.g.
                // tabindex) on the client once it upgrades, which the SSR markup
                // can't know about. Without this, React treats the attribute
                // drift as a hydration mismatch and regenerates the whole Player
                // subtree — orphaning the already-autoplaying SSR media element,
                // which then keeps emitting audio that the UI can't pause.
                suppressHydrationWarning
                preload="metadata"
                src={currentSource}
                poster={
                  mediaType === 'video'
                    ? posterThumbnailUrl || undefined
                    : undefined
                }
                playsInline
                autoplay
                className={
                  mediaType === 'video'
                    ? 'bg-black'
                    : 'bg-linear-to-t from-gray-100 to-50% to-gray-400/0 dark:from-gray-900 dark:to-gray-900/0'
                }
              />

              <div
                className={cn(
                  'pointer-events-none absolute inset-0 flex flex-col transition-opacity duration-300',
                  mediaType === 'video' &&
                    'group-[[userinactive]:not([mediapaused])]:opacity-0',
                )}
              >
                <div
                  className={cn(
                    'pointer-events-auto flex h-16 px-3 pt-3 group-[[mediaisfullscreen]]:h-24 group-[[mediaisfullscreen]]:px-6 group-[[mediaisfullscreen]]:pt-6',
                    showToggle || embed ? 'justify-between' : 'justify-end',
                    showToggle && 'group-[[mediaisfullscreen]]:justify-end',
                    mediaType === 'video' &&
                      'bg-linear-to-b from-gray-950/70 to-transparent',
                  )}
                  onPointerMove={() => {
                    // Trigger activity detection on MediaController
                    controllerRef.current?.dispatchEvent(
                      new PointerEvent('pointermove', { bubbles: true }),
                    );
                  }}
                >
                  {showToggle ? (
                    <div className="group-[[mediaisfullscreen]]:hidden">
                      <MediaSwitcher
                        value={mediaType}
                        onValueChange={(value) => {
                          if (value && videoRef.current) {
                            // Save current position and play state
                            setSavedPosition(videoRef.current.currentTime);
                            setSavedPlayState(!videoRef.current.paused);
                            // Clear auto-switch flag since user manually switched
                            autoSwitchedToAudioRef.current = false;
                            setMediaType(value);
                          }
                        }}
                      />
                    </div>
                  ) : embed ? (
                    <a
                      href={`https://lets.church/media/${uploadRecordId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start"
                    >
                      <Logo variant="light" />
                    </a>
                  ) : null}
                  <div className="flex items-start gap-2.5 group-[[mediaisfullscreen]]:gap-4">
                    <LcTooltip content="Mute" side="bottom">
                      <MediaMuteButton
                        noTooltip
                        className={cn(
                          'size-7 rounded-lg bg-transparent p-1 group-[[mediaisfullscreen]]:size-10 group-[[mediaisfullscreen]]:p-1.5',
                          mediaType === 'video'
                            ? 'border-fancy-pants bg-black/30 backdrop-blur-lg'
                            : '[--media-icon-color:var(--color-primary)]',
                        )}
                      />
                    </LcTooltip>
                    <LcTooltip content="Playback Rate" side="bottom">
                      <MediaPlaybackRateButton
                        noTooltip
                        className={cn(
                          'size-7 rounded-lg bg-transparent p-1 group-[[mediaisfullscreen]]:size-10 group-[[mediaisfullscreen]]:p-1.5',
                          mediaType === 'video'
                            ? 'border-fancy-pants bg-black/30 backdrop-blur-lg'
                            : 'text-primary',
                        )}
                      />
                    </LcTooltip>
                    {mediaType === 'video' ? (
                      <>
                        <LcTooltip content="Picture in Picture" side="bottom">
                          <MediaPipButton
                            noTooltip
                            className="size-7 rounded-lg border-fancy-pants bg-black/30 p-1 backdrop-blur-lg group-[[mediaisfullscreen]]:size-10 group-[[mediaisfullscreen]]:p-1.5"
                          />
                        </LcTooltip>
                        <LcTooltip content="Fullscreen" side="bottom">
                          <MediaFullscreenButton
                            noTooltip
                            className="size-7 rounded-lg border-fancy-pants bg-black/30 p-1 backdrop-blur-lg group-[[mediaisfullscreen]]:size-10 group-[[mediaisfullscreen]]:p-1.5"
                          />
                        </LcTooltip>
                      </>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  className="pointer-events-auto relative flex grow items-center justify-center gap-6 group-[[mediaisfullscreen]]:gap-10"
                  onClick={(e) => {
                    // Only toggle play/pause if clicking the background, not a button
                    if (e.target === e.currentTarget && videoRef.current) {
                      if (videoRef.current.paused) {
                        videoRef.current.play();
                      } else {
                        videoRef.current.pause();
                      }
                    }
                  }}
                  onPointerMove={() => {
                    // Trigger activity detection on MediaController
                    controllerRef.current?.dispatchEvent(
                      new PointerEvent('pointermove', { bubbles: true }),
                    );
                  }}
                >
                  <MediaSeekBackwardButton
                    seekOffset={15}
                    className={cn(
                      'size-8 rounded-lg bg-transparent group-[[mediaisfullscreen]]:size-12',
                      mediaType === 'video'
                        ? 'border-fancy-pants bg-black/30 backdrop-blur-lg'
                        : '[--media-icon-color:var(--color-primary)]',
                    )}
                  />
                  <MediaPlayButton
                    className={cn(
                      'size-12 rounded-lg bg-transparent group-[[mediaisfullscreen]]:size-18',
                      mediaType === 'video'
                        ? 'border-fancy-pants bg-black/30 backdrop-blur-lg'
                        : '[--media-icon-color:var(--color-primary)]',
                    )}
                  />
                  <MediaSeekForwardButton
                    seekOffset={15}
                    className={cn(
                      'size-8 rounded-lg bg-transparent group-[[mediaisfullscreen]]:size-12',
                      mediaType === 'video'
                        ? 'border-fancy-pants bg-black/30 backdrop-blur-lg'
                        : '[--media-icon-color:var(--color-primary)]',
                    )}
                  />
                </button>

                <div
                  className={cn(
                    'pointer-events-auto flex h-16 flex-col justify-end gap-1 px-4 pb-4 group-[[mediaisfullscreen]]:h-24 group-[[mediaisfullscreen]]:gap-2 group-[[mediaisfullscreen]]:px-8 group-[[mediaisfullscreen]]:pb-8',
                    mediaType === 'video' &&
                      'bg-linear-to-t from-gray-950/70 to-transparent',
                  )}
                >
                  <div className="flex justify-between px-2 font-normal tracking-[-0.2px]">
                    {isLive ? (
                      // Live: a LIVE button (lit at the edge, click to jump back
                      // to live) replaces the meaningless fixed duration; the
                      // range below acts as the DVR window scrubber.
                      <MediaLiveButton
                        className={cn(
                          'bg-transparent text-xs group-[[mediaisfullscreen]]:text-base',
                          '[--media-text-color:white]',
                        )}
                      />
                    ) : (
                      <>
                        <MediaTimeDisplay
                          className={cn(
                            'bg-transparent text-xs group-[[mediaisfullscreen]]:text-base',
                            '[--media-text-color:white]',
                            'tabular-nums',
                          )}
                          showDuration={false}
                        />
                        <MediaDurationDisplay
                          className={cn(
                            'bg-transparent text-xs group-[[mediaisfullscreen]]:text-base',
                            '[--media-text-color:white]',
                            'tabular-nums',
                          )}
                        />
                      </>
                    )}
                  </div>

                  <MediaTimeRange
                    className={cn(
                      '[--media-range-bar-color:--alpha(var(--color-brand)/60%)]',
                      '[--media-range-track-background:--alpha(var(--color-gray-950)/20%)]',
                      'dark:[--media-range-track-background:--alpha(var(--color-white)/20%)]',
                      '[--media-range-thumb-background:linear-gradient(45deg,--alpha(var(--color-brand)/0%)_50%,var(--color-indigo-300)_100%),var(--color-brand)]',
                      '[--media-range-thumb-box-shadow:0_1px_6px_0_--alpha(var(--color-black)/50%),0_2px_12px_0_var(--color-brand)]',
                      'group-[[mediaisfullscreen]]:h-[5px]',
                    )}
                    style={{
                      width: '100%',
                      height: '3px',
                      background: 'none',
                      '--media-range-track-border-radius': '3px',
                      '--media-range-thumb-width': '7px',
                      '--media-range-thumb-height': '7px',
                      '--media-range-thumb-border-radius': '6px',
                    }}
                  />
                </div>
              </div>
            </MediaController>

            {/* Seek feedback layer - independent of controls visibility */}
            {seekFeedback && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {seekFeedback.direction === 'backward' && (
                  <div className="-translate-x-1/2 absolute left-1/4 flex size-16 animate-ping items-center justify-center rounded-full bg-black/50">
                    <IconRewindBackward10 className="size-8 text-white" />
                  </div>
                )}
                {seekFeedback.direction === 'forward' && (
                  <div className="absolute right-1/4 flex size-16 translate-x-1/2 animate-ping items-center justify-center rounded-full bg-black/50">
                    <IconRewindForward10 className="size-8 text-white" />
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex size-full items-center justify-center">
            <p className="text-sm text-zinc-400">No media available</p>
          </div>
        )}
      </div>
    </LcTooltip.Provider>
  );
}
