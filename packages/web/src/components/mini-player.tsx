import type { HlsVideoElement } from 'hls-video-element';
import HlsVideo from 'hls-video-element/react';
import { useEffect, useRef, useState } from 'react';

import { formatTime } from '@/util/format';
import { stopMediaElement } from '@/util/stop-media-element';

const PLAYER_WIDTH = 320;
const AUDIO_PLAYER_HEIGHT = 88;
const BAR_COUNT = 48;

type Props = {
  mediaSource: string | null;
  audioSource: string | null;
  thumbnailUrl: string | null;
  initialTimestamp: number;
  currentTimeRef: React.MutableRefObject<number>;
  /** Optional caption shown beneath the player (e.g. the cited media's title
   * for answer footnotes). Omit for previews that don't need a label. */
  title?: string | null;
};

// Position-agnostic preview player: renders just the player surface (fixed
// width). Placement is handled by the caller (a Base UI PreviewCard popup).
export function MiniPlayer({
  mediaSource,
  audioSource,
  thumbnailUrl,
  initialTimestamp,
  currentTimeRef,
  title,
}: Props) {
  const videoRef = useRef<HlsVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displayTime, setDisplayTime] = useState(initialTimestamp);

  const hasVideo = Boolean(mediaSource);
  const source = mediaSource ?? audioSource;

  // Fully tear down the media element on unmount so a detached <hls-video> can't
  // keep emitting audio. The seek effect's pause() below only handles the live
  // element (and re-runs on re-seek); this dedicated unmount-only teardown also
  // kills hls.js and strips autoplay, defeating the deferred MANIFEST_PARSED
  // autoplay that otherwise resurrects a detached element. See stopMediaElement.
  useEffect(() => {
    const el = videoRef.current;
    return () => {
      stopMediaElement(el);
    };
  }, []);

  // Seek to initial timestamp and start playback
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let seeked = false;
    const seek = () => {
      if (seeked || el.readyState < 1) return;
      el.currentTime = initialTimestamp;
      seeked = true;
      el.play().catch(() => {});
    };

    seek();
    el.addEventListener('loadedmetadata', seek, { once: true });

    return () => {
      el.removeEventListener('loadedmetadata', seek);
      el.pause();
    };
  }, [initialTimestamp]);

  // Track current time for the timestamp badge and click-through navigation
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const handleTimeUpdate = () => {
      const t = el.currentTime;
      setDisplayTime(t);
      currentTimeRef.current = t;
    };

    el.addEventListener('timeupdate', handleTimeUpdate);
    return () => el.removeEventListener('timeupdate', handleTimeUpdate);
  }, [currentTimeRef]);

  // Real-time EQ visualizer driven by Web Audio API (audio-only mode)
  useEffect(() => {
    if (hasVideo) return;

    const el = videoRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let freqData: Uint8Array<ArrayBuffer> | null = null;
    let rafId = 0;

    const { width, height } = canvas;
    const gap = 2;
    const barW = (width - gap * (BAR_COUNT - 1)) / BAR_COUNT;

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(251, 191, 36, 0.95)');
    grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.85)');
    grad.addColorStop(1, 'rgba(234, 88, 12, 0.6)');

    // Pseudo-realistic EQ shape used as a fallback when AudioContext is
    // suspended (no trusted click gesture yet). Lower bands move slower and
    // taller; higher bands move faster and shorter — matching natural audio.
    const syntheticBar = (t: number, i: number) => {
      const norm = i / BAR_COUNT;
      const hz = 1.5 + norm * 3.5;
      const amp = 0.38 - norm * 0.18;
      const floor = 0.12 - norm * 0.04;
      return ((Math.sin(t * hz + i * 1.3) * 0.5 + 0.5) * amp + floor) * 255;
    };

    const draw = (ts: number) => {
      rafId = requestAnimationFrame(draw);

      // Keep nudging a suspended context — once the page gets any click the
      // browser will allow it and real data replaces the synthetic animation.
      if (audioCtx?.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
      }

      ctx.clearRect(0, 0, width, height);
      const isLive = audioCtx?.state === 'running' && freqData !== null;

      for (let i = 0; i < BAR_COUNT; i++) {
        const value = isLive
          ? (freqData?.[i] ?? 0)
          : syntheticBar(ts / 1000, i);
        const barH = Math.max(3, (value / 255) * height);
        const x = i * (barW + gap);
        const y = height - barH;

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [barW / 2, barW / 2, 0, 0]);
        ctx.fill();
      }
    };

    // Defer Web Audio setup until the element is actually playing so that
    // captureStream() returns a stream with audio tracks. The draw loop starts
    // immediately showing the synthetic animation; real EQ kicks in once audio
    // is confirmed playing.
    const setupAudio = () => {
      try {
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128; // power of two; gives 64 bins, we use the first BAR_COUNT
        analyser.smoothingTimeConstant = 0.75;

        // captureStream() is preferred: can be called multiple times (safe
        // under React StrictMode double-invoke), and doesn't reroute the
        // element's default audio output. Falls back to createMediaElementSource
        // on browsers without captureStream (e.g. Safari).
        type CaptureStreamEl = { captureStream(): MediaStream };
        if (
          typeof (el as unknown as CaptureStreamEl).captureStream === 'function'
        ) {
          const stream = (el as unknown as CaptureStreamEl).captureStream();
          const streamSource = audioCtx.createMediaStreamSource(stream);
          // Route through a silent gain node so the AudioContext graph is
          // pulled (keeping the analyser fed) without duplicating the audio
          // that the element already outputs through its default sink.
          const silencer = audioCtx.createGain();
          silencer.gain.value = 0;
          streamSource.connect(analyser);
          analyser.connect(silencer);
          silencer.connect(audioCtx.destination);
        } else {
          const elemSource = audioCtx.createMediaElementSource(el);
          elemSource.connect(analyser);
          analyser.connect(audioCtx.destination);
        }

        freqData = new Uint8Array(analyser.frequencyBinCount);
        audioCtx.resume().catch(() => {});
      } catch (e) {
        console.error(
          '[MiniPlayer] Web Audio setup failed, using synthetic EQ:',
          e,
        );
      }
    };

    if (!el.paused) {
      setupAudio();
    } else {
      el.addEventListener('playing', setupAudio, { once: true });
    }

    // Start the draw loop immediately; synthetic animation shows until setupAudio runs
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('playing', setupAudio);
      audioCtx?.close();
    };
  }, [hasVideo]);

  if (!source) return null;

  return (
    <div
      className="overflow-hidden rounded-xl border border-white/10 shadow-2xl"
      style={{ width: PLAYER_WIDTH }}
    >
      {hasVideo ? (
        <div className="relative bg-black">
          <HlsVideo
            ref={videoRef}
            src={source}
            poster={thumbnailUrl ?? undefined}
            autoplay
            playsInline
            style={{ width: '100%', display: 'block' }}
          />
          <div className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white tabular-nums">
            {formatTime(displayTime * 1000)}
          </div>
        </div>
      ) : (
        <div
          className="relative overflow-hidden bg-zinc-900"
          style={{ height: AUDIO_PLAYER_HEIGHT }}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-40 blur-sm"
            />
          ) : null}
          {/* Hidden video element used purely for HLS audio playback + Web Audio tap */}
          <HlsVideo
            ref={videoRef}
            src={source}
            autoplay
            playsInline
            style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            width={PLAYER_WIDTH}
            height={AUDIO_PLAYER_HEIGHT}
          />
          <div className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white tabular-nums">
            {formatTime(displayTime * 1000)}
          </div>
        </div>
      )}
      {title ? (
        <div className="bg-zinc-900 px-2.5 py-2">
          <p className="line-clamp-2 text-xs leading-snug font-medium text-white">
            {title}
          </p>
        </div>
      ) : null}
    </div>
  );
}
