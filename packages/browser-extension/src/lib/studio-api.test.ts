import { describe, expect, test } from 'vitest';

import { parseStudioConfig, toStudioVideo } from './studio-api';

describe('parseStudioConfig', () => {
  test('merges every ytcfg.set call and tolerates braces in strings', () => {
    const config = parseStudioConfig([
      'var x = 1; ytcfg.set({"INNERTUBE_API_KEY":"key","LABEL":"a } b"}); window.foo();',
      'ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"clientName":"WEB"}},"SESSION_INDEX":0});',
      'ytcfg.set(notJson); ytcfg.set({"CHANNEL_ID":"UC123"});',
    ]);
    expect(config).toMatchObject({
      INNERTUBE_API_KEY: 'key',
      INNERTUBE_CONTEXT: { client: { clientName: 'WEB' } },
      SESSION_INDEX: 0,
      CHANNEL_ID: 'UC123',
    });
  });
});

describe('toStudioVideo', () => {
  test('maps a published public video', () => {
    expect(
      toStudioVideo({
        videoId: 'abc',
        channelId: 'UC1',
        title: 'Sermon',
        description: 'Desc',
        lengthSeconds: '4581',
        timePublishedSeconds: '1790905719',
        timeCreatedSeconds: '1790899647',
        privacy: 'VIDEO_PRIVACY_PUBLIC',
        originalFilename: '20261001.mp4',
        downloadUrl: '/download_my_video?v=abc&t=tok',
        thumbnailDetails: {
          thumbnails: [
            {
              url: 'https://i9.ytimg.com/vi/abc/default.jpg?sqp=a',
              width: 120,
            },
            {
              url: 'https://i9.ytimg.com/vi/abc/maxresdefault.jpg?sqp=b',
              width: 1920,
            },
            { url: 'https://i9.ytimg.com/vi/abc/hq720.jpg?sqp=c', width: 1280 },
          ],
        },
      }),
    ).toEqual({
      videoId: 'abc',
      title: 'Sermon',
      description: 'Desc',
      lengthSeconds: 4581,
      publishedAt: 1790905719000,
      privacy: 'public',
      originalFileName: '20261001.mp4',
      downloadUrl: 'https://www.youtube.com/download_my_video?v=abc&t=tok',
      thumbnailUrl: 'https://i9.ytimg.com/vi/abc/maxresdefault.jpg?sqp=b',
      youtubeChannelId: 'UC1',
    });
  });

  test('falls back to creation time for never-published videos', () => {
    const video = toStudioVideo({
      videoId: 'p',
      timePublishedSeconds: '0',
      timeCreatedSeconds: '100',
      privacy: 'VIDEO_PRIVACY_PRIVATE',
    });
    expect(video).toMatchObject({ publishedAt: 100_000, privacy: 'private' });
  });

  test('ignores entries without a video id', () => {
    expect(toStudioVideo({ title: 'x' })).toBeNull();
  });
});
