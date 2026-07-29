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

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    const candidates: VideoThumbnailCandidate[] = [];

    for (const [index, timeSeconds] of times.entries()) {
      if (signal?.aborted) {
        throw abortError();
      }

      const seeked = waitForVideoEvent(video, 'seeked', signal);
      video.currentTime = Math.min(
        timeSeconds,
        Math.max(0, video.duration - 0.01),
      );
      await seeked;

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
