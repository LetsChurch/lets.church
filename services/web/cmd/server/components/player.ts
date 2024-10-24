import videojs from 'video.js';
import type VideoJsPlayer from 'video.js/dist/types/player';
import { chunk } from 'es-toolkit';

function serializeTimeRanges(
  ranges: TimeRanges,
): Array<{ start: number; end: number }> {
  const res: ReturnType<typeof serializeTimeRanges> = new Array(ranges.length);

  for (let i = 0; i < ranges.length; i += 1) {
    res[i] = { start: ranges.start(i), end: ranges.end(i) };
  }

  return res;
}

class LcPlayer extends HTMLElement {
  abortController: AbortController | null = null;
  player: VideoJsPlayer | null = null;
  reportRangesTimer: number | undefined = undefined;
  viewId: string | null = null;

  rob: ResizeObserver | null = null;

  constructor() {
    super();
  }

  connectedCallback() {
    const ac = (this.abortController = new AbortController());

    // video.js has issues in the shadow dom: https://github.com/videojs/video.js/issues/8069
    // const shadowRoot = this.attachShadow({ mode: "open" });
    const id = this.getAttribute('id');
    const videoSource = this.getAttribute('video-source');
    const audioSource = this.getAttribute('audio-source');

    const video = document.createElement('video');
    video.className = 'video-js';
    video.playsInline = true;
    this.appendChild(video);

    const audioOnlyMode = Boolean(!videoSource && audioSource);

    const sources: Array<{ src: string; type: string }> = [];

    if (videoSource) {
      sources.push({
        src: videoSource,
        type: 'application/x-mpegURL',
      });
    }

    if (audioSource) {
      sources.push({
        src: audioSource,
        type: 'application/x-mpegURL',
      });
    }

    const player = (this.player = videojs(
      video,
      {
        controls: true,
        audioOnlyMode,
        preload: 'auto',
        sources,
        playbackRates: [1, 1.25, 1.5, 1.75, 2],
        html5: {
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
    ));

    player.on('timeupdate', () => {
      const currentTime = this.player?.currentTime() ?? 0;
      document.dispatchEvent(
        new CustomEvent('lc:player:timeupdate', { detail: currentTime }),
      );
    });

    document.addEventListener(
      'lc:player:seek',
      (e) => {
        if (!('detail' in e) || typeof e.detail !== 'number') {
          return;
        }

        player.currentTime(e.detail);
      },
      { signal: ac.signal },
    );

    if (audioOnlyMode) {
      this.initWaveform();
    }

    async function reportTimeRanges() {
      try {
        const res = await fetch(`/media/${id}/record`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            viewId: this.viewId,
            ranges: serializeTimeRanges(video.played),
          }),
          signal: ac.signal,
        });

        const json = await res.json();

        if ('viewId' in json && typeof json.viewId === 'string') {
          this.viewId = json.viewId;
        }
      } finally {
        this.reportRangesTimer = window.setTimeout(reportTimeRanges, 5000);
      }
    }

    this.reportRangesTimer = window.setTimeout(reportTimeRanges, 5000);
  }

  disconnectedCallback() {
    this.player?.dispose();
    this.rob?.disconnect();
    this.abortController?.abort();
    this.innerHTML = '';
  }

  async initWaveform() {
    const TARGET_BAR_WIDTH = 7;

    const waveform = document.createElement('div');
    waveform.role = 'progressbar';
    waveform.className = 'lc-player__waveform';

    const total = document.createElement('div');
    total.className = 'lc-player__waveform__total';
    waveform.appendChild(total);

    const progress = document.createElement('div');
    progress.className = 'lc-player__waveform__progress';
    waveform.appendChild(progress);

    this.insertBefore(waveform, this.firstChild);

    waveform.addEventListener('click', (e) => {
      const { currentTarget } = e;
      if (!(currentTarget instanceof HTMLElement)) {
        return;
      }
      const rect = currentTarget?.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      waveform.style.setProperty('--progress', `${percentage * 100}%`);
      this.player?.currentTime((this.player?.duration() ?? 0) * percentage);
    });

    const peaksUrl = this.getAttribute('peaks-json-url');

    if (!peaksUrl) {
      throw new Error(
        'peaks-json-url attribute is required for audio-only mode',
      );
    }

    const peaksRes = await fetch(peaksUrl, {
      signal: this.abortController?.signal,
    });

    const { data: peaksData } = (await peaksRes.json()) as {
      data: Array<number>;
    };

    const rob = (this.rob = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        throw new Error('Resize observer entry is undefined');
      }

      total.innerHTML = '';
      progress.innerHTML = '';

      const barCount = Math.floor(entry.contentRect.width / TARGET_BAR_WIDTH);
      const reducedPeaks = chunk(
        peaksData,
        Math.floor(peaksData.length / barCount),
      ).map((chunk) => Math.max(...chunk));

      for (const peak of reducedPeaks) {
        for (const parent of [total, progress]) {
          const bar = document.createElement('div');
          bar.className = 'lc-player__waveform__bar';
          bar.style.height = `${((peak + 128) / (127 + 128)) * 100}%`;
          parent.appendChild(bar);
        }
      }
    }));

    rob.observe(this);

    this.player?.on('timeupdate', () => {
      const duration = this.player?.duration() ?? 0;
      const currentTime = this.player?.currentTime() ?? 0;
      if (duration > 0) {
        waveform.style.setProperty(
          '--progress',
          `${(currentTime / duration) * 100}%`,
        );
      }
    });
  }
}

customElements.define('lc-player', LcPlayer);
