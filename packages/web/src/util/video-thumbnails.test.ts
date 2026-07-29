import { describe, expect, it } from 'vitest';

import { getVideoThumbnailTimes } from './video-thumbnails';

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
