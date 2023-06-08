import { test, describe, expect } from 'vitest';
import {
  getVariants,
  variantsToMasterVideoPlaylist,
  ffmpegEncodingOutputArgs,
} from './ffmpeg';
import { ffprobeSchema } from './zod';

function mockProbe(width: number, height: number) {
  return {
    streams: [
      {
        codec_type: 'video' as const,
        width,
        height,
        index: 0,
      },
    ],
    format: {
      format_name: 'mp4',
      filename: 'test.mp4',
      duration: '00:00:00.000',
      nb_streams: 1,
    },
  };
}

describe('getVariants', () => {
  test('standard resolutions', () => {
    expect(getVariants(mockProbe(3840, 2160))).toMatchInlineSnapshot(`
      [
        "VIDEO_4K",
        "VIDEO_4K_DOWNLOAD",
        "VIDEO_1080P",
        "VIDEO_1080P_DOWNLOAD",
        "VIDEO_720P",
        "VIDEO_480P",
        "VIDEO_360P",
        "AUDIO",
        "AUDIO_DOWNLOAD",
      ]
    `);
    expect(getVariants(mockProbe(1920, 1080))).toMatchInlineSnapshot(`
      [
        "VIDEO_1080P",
        "VIDEO_1080P_DOWNLOAD",
        "VIDEO_720P",
        "VIDEO_480P",
        "VIDEO_360P",
        "AUDIO",
        "AUDIO_DOWNLOAD",
      ]
    `);
    expect(getVariants(mockProbe(1280, 720))).toMatchInlineSnapshot(`
      [
        "VIDEO_720P",
        "VIDEO_720P_DOWNLOAD",
        "VIDEO_480P",
        "VIDEO_360P",
        "AUDIO",
        "AUDIO_DOWNLOAD",
      ]
    `);
    expect(getVariants(mockProbe(842, 480))).toMatchInlineSnapshot(`
      [
        "VIDEO_480P",
        "VIDEO_480P_DOWNLOAD",
        "VIDEO_360P",
        "AUDIO",
        "AUDIO_DOWNLOAD",
      ]
    `);
    expect(getVariants(mockProbe(640, 360))).toMatchInlineSnapshot(`
      [
        "VIDEO_360P",
        "AUDIO",
        "AUDIO_DOWNLOAD",
      ]
    `);
  });

  test('non-standard resolutions', () => {
    expect(getVariants(mockProbe(4000, 4000))).toMatchInlineSnapshot(`
      [
        "VIDEO_4K",
        "VIDEO_4K_DOWNLOAD",
        "VIDEO_1080P",
        "VIDEO_1080P_DOWNLOAD",
        "VIDEO_720P",
        "VIDEO_480P",
        "VIDEO_360P",
        "AUDIO",
        "AUDIO_DOWNLOAD",
      ]
    `);
    expect(getVariants(mockProbe(2000, 2000))).toMatchInlineSnapshot(`
      [
        "VIDEO_1080P",
        "VIDEO_1080P_DOWNLOAD",
        "VIDEO_720P",
        "VIDEO_480P",
        "VIDEO_360P",
        "AUDIO",
        "AUDIO_DOWNLOAD",
      ]
    `);
    expect(getVariants(mockProbe(1000, 1000))).toMatchInlineSnapshot(`
      [
        "VIDEO_720P",
        "VIDEO_720P_DOWNLOAD",
        "VIDEO_480P",
        "VIDEO_360P",
        "AUDIO",
        "AUDIO_DOWNLOAD",
      ]
    `);
    expect(getVariants(mockProbe(500, 500))).toMatchInlineSnapshot(`
      [
        "VIDEO_480P",
        "VIDEO_480P_DOWNLOAD",
        "VIDEO_360P",
        "AUDIO",
        "AUDIO_DOWNLOAD",
      ]
    `);
  });

  describe('real probes', () => {
    test('1080p mp4 dividing line', () => {
      const probe = ffprobeSchema.parse(
        JSON.parse(`
        {
            "streams": [
                {
                    "index": 0,
                    "codec_name": "h264",
                    "codec_long_name": "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
                    "profile": "High",
                    "codec_type": "video",
                    "codec_tag_string": "avc1",
                    "codec_tag": "0x31637661",
                    "width": 1920,
                    "height": 1080,
                    "coded_width": 1920,
                    "coded_height": 1080,
                    "closed_captions": 0,
                    "film_grain": 0,
                    "has_b_frames": 1,
                    "sample_aspect_ratio": "1:1",
                    "display_aspect_ratio": "16:9",
                    "pix_fmt": "yuv420p",
                    "level": 40,
                    "color_range": "tv",
                    "color_space": "bt709",
                    "color_transfer": "bt709",
                    "color_primaries": "bt709",
                    "chroma_location": "left",
                    "field_order": "progressive",
                    "refs": 1,
                    "is_avc": "true",
                    "nal_length_size": "4",
                    "id": "0x1",
                    "r_frame_rate": "24/1",
                    "avg_frame_rate": "24/1",
                    "time_base": "1/12288",
                    "start_pts": 0,
                    "start_time": "0.000000",
                    "duration_ts": 49594368,
                    "duration": "4036.000000",
                    "bit_rate": "841660",
                    "bits_per_raw_sample": "8",
                    "nb_frames": "96864",
                    "extradata_size": 45,
                    "disposition": {
                        "default": 1,
                        "dub": 0,
                        "original": 0,
                        "comment": 0,
                        "lyrics": 0,
                        "karaoke": 0,
                        "forced": 0,
                        "hearing_impaired": 0,
                        "visual_impaired": 0,
                        "clean_effects": 0,
                        "attached_pic": 0,
                        "timed_thumbnails": 0,
                        "captions": 0,
                        "descriptions": 0,
                        "metadata": 0,
                        "dependent": 0,
                        "still_image": 0
                    },
                    "tags": {
                        "language": "und",
                        "handler_name": "ISO Media file produced by Google Inc.",
                        "vendor_id": "[0][0][0][0]"
                    }
                },
                {
                    "index": 1,
                    "codec_name": "aac",
                    "codec_long_name": "AAC (Advanced Audio Coding)",
                    "profile": "LC",
                    "codec_type": "audio",
                    "codec_tag_string": "mp4a",
                    "codec_tag": "0x6134706d",
                    "sample_fmt": "fltp",
                    "sample_rate": "44100",
                    "channels": 2,
                    "channel_layout": "stereo",
                    "bits_per_sample": 0,
                    "initial_padding": 0,
                    "id": "0x2",
                    "r_frame_rate": "0/0",
                    "avg_frame_rate": "0/0",
                    "time_base": "1/44100",
                    "start_pts": 0,
                    "start_time": "0.000000",
                    "duration_ts": 177990656,
                    "duration": "4036.069297",
                    "bit_rate": "127999",
                    "nb_frames": "173819",
                    "extradata_size": 16,
                    "disposition": {
                        "default": 1,
                        "dub": 0,
                        "original": 0,
                        "comment": 0,
                        "lyrics": 0,
                        "karaoke": 0,
                        "forced": 0,
                        "hearing_impaired": 0,
                        "visual_impaired": 0,
                        "clean_effects": 0,
                        "attached_pic": 0,
                        "timed_thumbnails": 0,
                        "captions": 0,
                        "descriptions": 0,
                        "metadata": 0,
                        "dependent": 0,
                        "still_image": 0
                    },
                    "tags": {
                        "language": "eng",
                        "handler_name": "ISO Media file produced by Google Inc.",
                        "vendor_id": "[0][0][0][0]"
                    }
                }
            ],
            "format": {
                "filename": "The Dividing Line- Flying Solo!.mp4",
                "nb_streams": 2,
                "nb_programs": 0,
                "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
                "format_long_name": "QuickTime / MOV",
                "start_time": "0.000000",
                "duration": "4036.069297",
                "size": "492192719",
                "bit_rate": "975588",
                "probe_score": 100,
                "tags": {
                    "major_brand": "isom",
                    "minor_version": "512",
                    "compatible_brands": "isomiso2avc1mp41",
                    "encoder": "Lavf59.30.100"
                }
            }
        }
      `),
      );
      expect(getVariants(probe)).toMatchInlineSnapshot(`
        [
          "VIDEO_1080P",
          "VIDEO_1080P_DOWNLOAD",
          "VIDEO_720P",
          "VIDEO_480P",
          "VIDEO_360P",
          "AUDIO",
          "AUDIO_DOWNLOAD",
        ]
      `);
    });

    test('4k web dividing line', () => {
      const probe = ffprobeSchema.parse(
        JSON.parse(`
          {
              "streams": [
                  {
                      "index": 0,
                      "codec_name": "vp9",
                      "codec_long_name": "Google VP9",
                      "profile": "Profile 0",
                      "codec_type": "video",
                      "codec_tag_string": "[0][0][0][0]",
                      "codec_tag": "0x0000",
                      "width": 3840,
                      "height": 2160,
                      "coded_width": 3840,
                      "coded_height": 2160,
                      "closed_captions": 0,
                      "film_grain": 0,
                      "has_b_frames": 0,
                      "sample_aspect_ratio": "1:1",
                      "display_aspect_ratio": "16:9",
                      "pix_fmt": "yuv420p",
                      "level": -99,
                      "color_range": "tv",
                      "color_space": "bt709",
                      "color_transfer": "bt709",
                      "color_primaries": "bt709",
                      "refs": 1,
                      "r_frame_rate": "24000/1001",
                      "avg_frame_rate": "24000/1001",
                      "time_base": "1/1000",
                      "start_pts": 0,
                      "start_time": "0.000000",
                      "disposition": {
                          "default": 1,
                          "dub": 0,
                          "original": 0,
                          "comment": 0,
                          "lyrics": 0,
                          "karaoke": 0,
                          "forced": 0,
                          "hearing_impaired": 0,
                          "visual_impaired": 0,
                          "clean_effects": 0,
                          "attached_pic": 0,
                          "timed_thumbnails": 0,
                          "captions": 0,
                          "descriptions": 0,
                          "metadata": 0,
                          "dependent": 0,
                          "still_image": 0
                      },
                      "tags": {
                          "language": "eng",
                          "DURATION": "01:07:09.900000000"
                      }
                  },
                  {
                      "index": 1,
                      "codec_name": "opus",
                      "codec_long_name": "Opus (Opus Interactive Audio Codec)",
                      "codec_type": "audio",
                      "codec_tag_string": "[0][0][0][0]",
                      "codec_tag": "0x0000",
                      "sample_fmt": "fltp",
                      "sample_rate": "48000",
                      "channels": 2,
                      "channel_layout": "stereo",
                      "bits_per_sample": 0,
                      "initial_padding": 312,
                      "r_frame_rate": "0/0",
                      "avg_frame_rate": "0/0",
                      "time_base": "1/1000",
                      "start_pts": -7,
                      "start_time": "-0.007000",
                      "extradata_size": 19,
                      "disposition": {
                          "default": 1,
                          "dub": 0,
                          "original": 0,
                          "comment": 0,
                          "lyrics": 0,
                          "karaoke": 0,
                          "forced": 0,
                          "hearing_impaired": 0,
                          "visual_impaired": 0,
                          "clean_effects": 0,
                          "attached_pic": 0,
                          "timed_thumbnails": 0,
                          "captions": 0,
                          "descriptions": 0,
                          "metadata": 0,
                          "dependent": 0,
                          "still_image": 0
                      },
                      "tags": {
                          "language": "eng",
                          "DURATION": "01:07:09.921000000"
                      }
                  }
              ],
              "format": {
                  "filename": "Thinking Through the Ugandan Controversy (4K).webm",
                  "nb_streams": 2,
                  "nb_programs": 0,
                  "format_name": "matroska,webm",
                  "format_long_name": "Matroska / WebM",
                  "start_time": "-0.007000",
                  "duration": "4029.921000",
                  "size": "4111086606",
                  "bit_rate": "8161125",
                  "probe_score": 100,
                  "tags": {
                      "ENCODER": "Lavf59.30.100"
                  }
              }
          }
        `),
      );
      expect(getVariants(probe)).toMatchInlineSnapshot(`
        [
          "VIDEO_4K",
          "VIDEO_4K_DOWNLOAD",
          "VIDEO_1080P",
          "VIDEO_1080P_DOWNLOAD",
          "VIDEO_720P",
          "VIDEO_480P",
          "VIDEO_360P",
          "AUDIO",
          "AUDIO_DOWNLOAD",
        ]
      `);
    });

    test('mp3 dividing line', () => {
      const probe = ffprobeSchema.parse(
        JSON.parse(`
          {
            "streams": [
              {
                "index": 0,
                "codec_name": "mp3",
                "codec_long_name": "MP3 (MPEG audio layer 3)",
                "codec_type": "audio",
                "codec_tag_string": "[0][0][0][0]",
                "codec_tag": "0x0000",
                "sample_fmt": "fltp",
                "sample_rate": "24000",
                "channels": 2,
                "channel_layout": "stereo",
                "bits_per_sample": 0,
                "initial_padding": 0,
                "r_frame_rate": "0/0",
                "avg_frame_rate": "0/0",
                "time_base": "1/14112000",
                "start_pts": 0,
                "start_time": "0.000000",
                "duration_ts": 102325660416,
                "duration": "7250.968000",
                "bit_rate": "64000",
                "disposition": {
                  "default": 0,
                  "dub": 0,
                  "original": 0,
                  "comment": 0,
                  "lyrics": 0,
                  "karaoke": 0,
                  "forced": 0,
                  "hearing_impaired": 0,
                  "visual_impaired": 0,
                  "clean_effects": 0,
                  "attached_pic": 0,
                  "timed_thumbnails": 0,
                  "captions": 0,
                  "descriptions": 0,
                  "metadata": 0,
                  "dependent": 0,
                  "still_image": 0
                }
              },
              {
                "index": 1,
                "codec_name": "mjpeg",
                "codec_long_name": "Motion JPEG",
                "profile": "Baseline",
                "codec_type": "video",
                "codec_tag_string": "[0][0][0][0]",
                "codec_tag": "0x0000",
                "width": 1800,
                "height": 1800,
                "coded_width": 1800,
                "coded_height": 1800,
                "closed_captions": 0,
                "film_grain": 0,
                "has_b_frames": 0,
                "sample_aspect_ratio": "1:1",
                "display_aspect_ratio": "1:1",
                "pix_fmt": "yuvj420p",
                "level": -99,
                "color_range": "pc",
                "color_space": "bt470bg",
                "chroma_location": "center",
                "refs": 1,
                "r_frame_rate": "90000/1",
                "avg_frame_rate": "0/0",
                "time_base": "1/90000",
                "duration_ts": 652587120,
                "duration": "7250.968000",
                "bits_per_raw_sample": "8",
                "disposition": {
                  "default": 0,
                  "dub": 0,
                  "original": 0,
                  "comment": 0,
                  "lyrics": 0,
                  "karaoke": 0,
                  "forced": 0,
                  "hearing_impaired": 0,
                  "visual_impaired": 0,
                  "clean_effects": 0,
                  "attached_pic": 1,
                  "timed_thumbnails": 0,
                  "captions": 0,
                  "descriptions": 0,
                  "metadata": 0,
                  "dependent": 0,
                  "still_image": 0
                },
                "tags": {
                  "title": "Can a Consistent.jpg",
                  "comment": "Cover (front)"
                }
              }
            ],
            "format": {
              "filename": "./413171540156.mp3",
              "nb_streams": 2,
              "nb_programs": 0,
              "format_name": "mp3",
              "format_long_name": "MP2/3 (MPEG audio layer 2/3)",
              "start_time": "0.000000",
              "duration": "7250.968000",
              "size": "58480342",
              "bit_rate": "64521",
              "probe_score": 51,
              "tags": {
                "title": "Can a Consistent Eastern..",
                "artist": "Dr. James White",
                "album": "Alpha and Omega Ministries",
                "genre": "Other",
                "comment": "The Dividing Line 2017",
                "date": "2017"
              }
            }
          }
        `),
      );
      expect(getVariants(probe)).toMatchInlineSnapshot(`
        [
          "AUDIO",
          "AUDIO_DOWNLOAD",
        ]
      `);
    });

    test('m4a tsc', () => {
      const probe = ffprobeSchema.parse(
        JSON.parse(`
          {
              "streams": [
                  {
                      "index": 0,
                      "codec_name": "aac",
                      "codec_long_name": "AAC (Advanced Audio Coding)",
                      "profile": "LC",
                      "codec_type": "audio",
                      "codec_tag_string": "mp4a",
                      "codec_tag": "0x6134706d",
                      "sample_fmt": "fltp",
                      "sample_rate": "44100",
                      "channels": 2,
                      "channel_layout": "stereo",
                      "bits_per_sample": 0,
                      "initial_padding": 0,
                      "id": "0x1",
                      "r_frame_rate": "0/0",
                      "avg_frame_rate": "0/0",
                      "time_base": "1/44100",
                      "start_pts": 0,
                      "start_time": "0.000000",
                      "duration_ts": 118261667,
                      "duration": "2681.670454",
                      "bit_rate": "128000",
                      "nb_frames": "115490",
                      "extradata_size": 2,
                      "disposition": {
                          "default": 1,
                          "dub": 0,
                          "original": 0,
                          "comment": 0,
                          "lyrics": 0,
                          "karaoke": 0,
                          "forced": 0,
                          "hearing_impaired": 0,
                          "visual_impaired": 0,
                          "clean_effects": 0,
                          "attached_pic": 0,
                          "timed_thumbnails": 0,
                          "captions": 0,
                          "descriptions": 0,
                          "metadata": 0,
                          "dependent": 0,
                          "still_image": 0
                      },
                      "tags": {
                          "language": "eng",
                          "handler_name": "SoundHandler",
                          "vendor_id": "[0][0][0][0]"
                      }
                  }
              ],
              "format": {
                  "filename": "tsc.m4a",
                  "nb_streams": 1,
                  "nb_programs": 0,
                  "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
                  "format_long_name": "QuickTime / MOV",
                  "start_time": "0.000000",
                  "duration": "2681.670454",
                  "size": "43369818",
                  "bit_rate": "129381",
                  "probe_score": 100,
                  "tags": {
                      "major_brand": "isom",
                      "minor_version": "512",
                      "compatible_brands": "isomiso2mp41",
                      "encoder": "Lavf58.76.100"
                  }
              }
          }
      `),
      );
      expect(getVariants(probe)).toMatchInlineSnapshot(`
        [
          "AUDIO",
          "AUDIO_DOWNLOAD",
        ]
      `);
    });
  });
});

test('variantsToMasterVideoPlaylist', () => {
  expect(variantsToMasterVideoPlaylist(['VIDEO_4K', 'VIDEO_1080P']))
    .toMatchInlineSnapshot(`
      "#EXTM3U
      #EXT-X-VERSION:3
      #EXT-X-STREAM-INF:BANDWIDTH=18200000,RESOLUTION=3840x2160
      VIDEO_4K.m3u8
      #EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
      VIDEO_1080P.m3u8"
    `);

  expect(
    variantsToMasterVideoPlaylist([
      'VIDEO_1080P',
      'VIDEO_720P',
      'VIDEO_480P',
      'VIDEO_360P',
    ]),
  ).toMatchInlineSnapshot(`
    "#EXTM3U
    #EXT-X-VERSION:3
    #EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
    VIDEO_1080P.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
    VIDEO_720P.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=842x480
    VIDEO_480P.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
    VIDEO_360P.m3u8"
  `);
});

test('ffmpegEncodingOutputArgs', () => {
  expect(
    ffmpegEncodingOutputArgs([
      'VIDEO_4K',
      'VIDEO_4K_DOWNLOAD',
      'VIDEO_1080P',
      'VIDEO_1080P_DOWNLOAD',
    ]),
  ).toMatchInlineSnapshot(`
    [
      "-vf",
      "scale=w=3840:h=2160:force_original_aspect_ratio=decrease",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-b:v",
      "18200k",
      "-maxrate",
      "19474k",
      "-bufsize",
      "27300k",
      "-b:a",
      "192k",
      "-hls_segment_filename",
      "VIDEO_4K_%04d.ts",
      "VIDEO_4K.m3u8",
      "-vf",
      "scale=w=3840:h=2160:force_original_aspect_ratio=decrease",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-b:v",
      "18200k",
      "-maxrate",
      "19474k",
      "-bufsize",
      "27300k",
      "-b:a",
      "192k",
      "VIDEO_4K_DOWNLOAD.mp4",
      "-vf",
      "scale=w=1920:h=1080:force_original_aspect_ratio=decrease",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-b:v",
      "5000k",
      "-maxrate",
      "5350k",
      "-bufsize",
      "7500k",
      "-b:a",
      "192k",
      "-hls_segment_filename",
      "VIDEO_1080P_%04d.ts",
      "VIDEO_1080P.m3u8",
      "-vf",
      "scale=w=1920:h=1080:force_original_aspect_ratio=decrease",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-b:v",
      "5000k",
      "-maxrate",
      "5350k",
      "-bufsize",
      "7500k",
      "-b:a",
      "192k",
      "VIDEO_1080P_DOWNLOAD.mp4",
    ]
  `);

  expect(
    ffmpegEncodingOutputArgs([
      'VIDEO_1080P',
      'VIDEO_1080P_DOWNLOAD',
      'VIDEO_720P',
      'VIDEO_480P',
      'VIDEO_360P',
      'AUDIO',
      'AUDIO_DOWNLOAD',
    ]),
  ).toMatchInlineSnapshot(`
    [
      "-vf",
      "scale=w=1920:h=1080:force_original_aspect_ratio=decrease",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-b:v",
      "5000k",
      "-maxrate",
      "5350k",
      "-bufsize",
      "7500k",
      "-b:a",
      "192k",
      "-hls_segment_filename",
      "VIDEO_1080P_%04d.ts",
      "VIDEO_1080P.m3u8",
      "-vf",
      "scale=w=1920:h=1080:force_original_aspect_ratio=decrease",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-b:v",
      "5000k",
      "-maxrate",
      "5350k",
      "-bufsize",
      "7500k",
      "-b:a",
      "192k",
      "VIDEO_1080P_DOWNLOAD.mp4",
      "-vf",
      "scale=w=1280:h=720:force_original_aspect_ratio=decrease",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-b:v",
      "2800k",
      "-maxrate",
      "2996k",
      "-bufsize",
      "4200k",
      "-b:a",
      "128k",
      "-hls_segment_filename",
      "VIDEO_720P_%04d.ts",
      "VIDEO_720P.m3u8",
      "-vf",
      "scale=w=842:h=480:force_original_aspect_ratio=decrease",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-b:v",
      "1400k",
      "-maxrate",
      "1498k",
      "-bufsize",
      "2100k",
      "-b:a",
      "128k",
      "-hls_segment_filename",
      "VIDEO_480P_%04d.ts",
      "VIDEO_480P.m3u8",
      "-vf",
      "scale=w=640:h=360:force_original_aspect_ratio=decrease",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-c:v",
      "h264",
      "-profile:v",
      "main",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-b:v",
      "800k",
      "-maxrate",
      "856k",
      "-bufsize",
      "1200k",
      "-b:a",
      "96k",
      "-hls_segment_filename",
      "VIDEO_360P_%04d.ts",
      "VIDEO_360P.m3u8",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-vn",
      "-b:a",
      "192k",
      "-hls_segment_filename",
      "AUDIO_%04d.ts",
      "AUDIO.m3u8",
      "-crf",
      "20",
      "-sc_threshold",
      "0",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-vn",
      "-b:a",
      "192k",
      "AUDIO_DOWNLOAD.m4a",
    ]
  `);
});
