import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractVideoThumbnailCandidates,
  getVideoThumbnailTimes,
} from './video-thumbnails';

describe('getVideoThumbnailTimes', () => {
  it('spaces candidates throughout the video without using the endpoints', () => {
    expect(getVideoThumbnailTimes(70, 6)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('returns no candidates for invalid inputs', () => {
    expect(getVideoThumbnailTimes(Number.NaN, 6)).toEqual([]);
    expect(getVideoThumbnailTimes(0, 6)).toEqual([]);
    expect(getVideoThumbnailTimes(60, 0)).toEqual([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('extractVideoThumbnailCandidates', () => {
  it.each([
    { name: 'black', openingLuminance: 0 },
    { name: 'white', openingLuminance: 255 },
  ])(
    'includes the first non-blank frame after a $name opening',
    async ({ openingLuminance }) => {
      class FakeVideo extends EventTarget {
        duration = 12;
        videoHeight = 720;
        videoWidth = 1280;
        preload = '';
        muted = false;
        playsInline = false;
        private time = 0;

        get currentTime() {
          return this.time;
        }

        set currentTime(value: number) {
          this.time = value;
          queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
        }

        set src(_value: string) {
          queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
        }

        load() {}

        removeAttribute() {}
      }

      const video = new FakeVideo();
      const createCanvas = () => {
        let drawnTime = 0;

        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: (source: FakeVideo) => {
              drawnTime = source.currentTime;
            },
            getImageData: () => {
              const data = new Uint8ClampedArray(64 * 36 * 4);
              for (let offset = 0; offset < data.length; offset += 4) {
                const luminance =
                  drawnTime < 1
                    ? openingLuminance
                    : (offset / 4) % 2 === 0
                      ? 32
                      : 224;
                data[offset] = luminance;
                data[offset + 1] = luminance;
                data[offset + 2] = luminance;
                data[offset + 3] = 255;
              }
              return { data };
            },
          }),
          toBlob: (callback: BlobCallback) => {
            callback(new Blob(['thumbnail'], { type: 'image/jpeg' }));
          },
        };
      };

      vi.stubGlobal('document', {
        createElement: (tagName: string) =>
          tagName === 'video' ? video : createCanvas(),
      });
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

      const candidates = await extractVideoThumbnailCandidates(
        new File(['video'], 'sermon.mp4', { type: 'video/mp4' }),
        { count: 2 },
      );

      expect(candidates.map(({ timeSeconds }) => timeSeconds)).toEqual([
        1, 4, 8,
      ]);
    },
  );
});
