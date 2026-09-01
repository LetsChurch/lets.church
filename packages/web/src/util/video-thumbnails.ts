export type VideoThumbnailCandidate = {
  file: File;
  timeSeconds: number;
};

type ExtractVideoThumbnailOptions = {
  count?: number;
  maxWidth?: number;
  quality?: number;
  signal?: AbortSignal;
};

const FRAME_ANALYSIS_WIDTH = 64;
const FRAME_ANALYSIS_HEIGHT = 36;
const BLANK_FRAME_MAX_LUMINANCE_SPREAD = 12;
const BLANK_FRAME_MIN_UNIFORM_PIXEL_RATIO = 0.995;
const FIRST_FRAME_INITIAL_PROBE_SECONDS = 0.1;
const FIRST_FRAME_SEARCH_PRECISION_SECONDS = 0.05;

function abortError() {
  return new DOMException('Thumbnail generation was cancelled', 'AbortError');
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'seeked',
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('The browser could not read this video file'));
    };
    const handleAbort = () => {
      cleanup();
      reject(abortError());
    };

    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener('error', handleError, { once: true });
    signal?.addEventListener('abort', handleAbort, { once: true });

    if (signal?.aborted) {
      handleAbort();
    }
  });
}

async function seekVideo(
  video: HTMLVideoElement,
  timeSeconds: number,
  signal?: AbortSignal,
) {
  const seeked = waitForVideoEvent(video, 'seeked', signal);
  video.currentTime = Math.min(timeSeconds, Math.max(0, video.duration - 0.01));
  await seeked;
}

function isBlankVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  luminanceHistogram: Uint16Array,
) {
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  luminanceHistogram.fill(0);

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const luminance = Math.round(
      (54 * pixels[offset] +
        183 * pixels[offset + 1] +
        19 * pixels[offset + 2]) /
        256,
    );
    luminanceHistogram[luminance]++;
  }

  let uniformPixels = 0;
  let pixelsInWindow = 0;

  for (let luminance = 0; luminance < luminanceHistogram.length; luminance++) {
    pixelsInWindow += luminanceHistogram[luminance];
    if (luminance > BLANK_FRAME_MAX_LUMINANCE_SPREAD) {
      pixelsInWindow -=
        luminanceHistogram[luminance - BLANK_FRAME_MAX_LUMINANCE_SPREAD - 1];
    }
    uniformPixels = Math.max(uniformPixels, pixelsInWindow);
  }

  return (
    uniformPixels / (pixels.length / 4) >= BLANK_FRAME_MIN_UNIFORM_PIXEL_RATIO
  );
}

async function findFirstNonBlankFrameTime(
  video: HTMLVideoElement,
  signal?: AbortSignal,
) {
  const lastTime = Math.max(0, video.duration - 0.01);
  if (lastTime === 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_ANALYSIS_WIDTH;
  canvas.height = FRAME_ANALYSIS_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('The browser could not create a thumbnail canvas');
  }

  const luminanceHistogram = new Uint16Array(256);

  let lastBlankTime = 0;
  let firstNonBlankTime: number;
  let probeTime = Math.min(FIRST_FRAME_INITIAL_PROBE_SECONDS, lastTime);

  while (true) {
    if (signal?.aborted) {
      throw abortError();
    }

    await seekVideo(video, probeTime, signal);
    if (!isBlankVideoFrame(video, canvas, context, luminanceHistogram)) {
      firstNonBlankTime = probeTime;
      break;
    }

    if (probeTime >= lastTime) {
      return null;
    }

    lastBlankTime = probeTime;
    probeTime = Math.min(probeTime * 2, lastTime);
  }

  while (
    firstNonBlankTime - lastBlankTime >
    FIRST_FRAME_SEARCH_PRECISION_SECONDS
  ) {
    const midpoint = (lastBlankTime + firstNonBlankTime) / 2;
    await seekVideo(video, midpoint, signal);

    if (isBlankVideoFrame(video, canvas, context, luminanceHistogram)) {
      lastBlankTime = midpoint;
    } else {
      firstNonBlankTime = midpoint;
    }
  }

  return firstNonBlankTime;
}

function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
  signal?: AbortSignal,
) {
  return new Promise<Blob>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    canvas.toBlob(
      (blob) => {
        if (signal?.aborted) {
          reject(abortError());
        } else if (blob) {
          resolve(blob);
        } else {
          reject(new Error('The browser could not create a thumbnail'));
        }
      },
      'image/jpeg',
      quality,
    );
  });
}

export function getVideoThumbnailTimes(duration: number, count: number) {
  if (!Number.isFinite(duration) || duration <= 0 || count <= 0) {
    return [];
  }

  // Avoid the very beginning and end, where fades and black frames are common.
  return Array.from(
    { length: count },
    (_, index) => (duration * (index + 1)) / (count + 1),
  );
}

export async function extractVideoThumbnailCandidates(
  file: File,
  {
    count = 6,
    maxWidth = 1280,
    quality = 0.9,
    signal,
  }: ExtractVideoThumbnailOptions = {},
): Promise<VideoThumbnailCandidate[]> {
  if (signal?.aborted) {
    throw abortError();
  }

  const video = document.createElement('video');
  const videoUrl = URL.createObjectURL(file);
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  const metadataLoaded = waitForVideoEvent(video, 'loadedmetadata', signal);
  video.src = videoUrl;

  try {
    await metadataLoaded;

    const times = getVideoThumbnailTimes(video.duration, count);
    if (times.length === 0 || video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error('The browser could not determine the video dimensions');
    }

    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('The browser could not create a thumbnail canvas');
    }

    const firstNonBlankFrameTime = await findFirstNonBlankFrameTime(
      video,
      signal,
    );
    if (
      firstNonBlankFrameTime !== null &&
      !times.some(
        (time) =>
          Math.abs(time - firstNonBlankFrameTime) <=
          FIRST_FRAME_SEARCH_PRECISION_SECONDS,
      )
    ) {
      times.push(firstNonBlankFrameTime);
      times.sort((a, b) => a - b);
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    const candidates: VideoThumbnailCandidate[] = [];

    for (const [index, timeSeconds] of times.entries()) {
      if (signal?.aborted) {
        throw abortError();
      }

      await seekVideo(video, timeSeconds, signal);

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToJpeg(canvas, quality, signal);
      candidates.push({
        file: new File([blob], `${baseName}-thumbnail-${index + 1}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        }),
        timeSeconds,
      });
    }

    return candidates;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(videoUrl);
  }
}
