import { afterEach, describe, expect, test } from 'vitest';

import {
  encodeSessionCount,
  extraDecodeArgs,
  ffmpegEncodeArgs,
  ffmpegEncodingArgs,
  ffmpegThumbnailArgs,
  getVariants,
  parseFrameRate,
  parseM3u8,
  probeFrameRate,
  probeToDecodeCost,
  thumbnailsUseAma,
  variantEncodeUnits,
  variantsToEncodeCost,
  variantsToMasterVideoPlaylist,
} from './ffmpeg';
import { ffprobeSchema } from './zod';

function mockProbe(
  width: number,
  height: number,
  codec_name = 'h264',
  withAudio = true,
  avg_frame_rate?: string,
  duration = '00:00:00.000',
) {
  return {
    streams: [
      {
        codec_type: 'video' as const,
        codec_name,
        width,
        height,
        index: 0,
        ...(avg_frame_rate ? { avg_frame_rate } : {}),
      },
      ...(withAudio
        ? [{ codec_type: 'audio' as const, codec_name: 'aac', index: 1 }]
        : []),
    ],
    format: {
      format_name: 'mp4',
      filename: 'test.mp4',
      duration,
      nb_streams: withAudio ? 2 : 1,
    },
  };
}

describe('variantEncodeUnits', () => {
  test('weights each rendition by its 1080p-equivalent pixel area', () => {
    expect(variantEncodeUnits('VIDEO_4K')).toBeCloseTo(4);
    expect(variantEncodeUnits('VIDEO_1080P')).toBeCloseTo(1);
    expect(variantEncodeUnits('VIDEO_720P')).toBeCloseTo(0.4444, 3);
    expect(variantEncodeUnits('VIDEO_480P')).toBeCloseTo(0.25);
  });

  test('audio and non-video variants cost nothing', () => {
    expect(variantEncodeUnits('AUDIO')).toBe(0);
    expect(variantEncodeUnits('AUDIO_DOWNLOAD')).toBe(0);
    expect(variantEncodeUnits('VIDEO_4K_DOWNLOAD')).toBe(0);
  });
});

describe('parseFrameRate', () => {
  test('parses ffprobe rationals', () => {
    expect(parseFrameRate('30/1')).toBe(30);
    expect(parseFrameRate('60/1')).toBe(60);
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
  });

  test('returns null for missing or degenerate values', () => {
    expect(parseFrameRate(undefined)).toBeNull();
    expect(parseFrameRate('0/0')).toBeNull();
    expect(parseFrameRate('25/0')).toBeNull();
    expect(parseFrameRate('garbage')).toBeNull();
  });
});

describe('probeFrameRate', () => {
  test('reads avg_frame_rate from the video stream', () => {
    expect(probeFrameRate(mockProbe(1920, 1080, 'h264', true, '30/1'))).toBe(
      30,
    );
    expect(
      probeFrameRate(mockProbe(1920, 1080, 'h264', true, '30000/1001')),
    ).toBeCloseTo(29.97, 2);
  });

  test('falls back to 60fps when the rate is unknown (conservative)', () => {
    expect(probeFrameRate(mockProbe(1920, 1080))).toBe(60);
    expect(probeFrameRate(mockProbe(1920, 1080, 'h264', true, '0/0'))).toBe(60);
  });

  test('clamps absurd probe frame rates (malformed probe guard)', () => {
    // A garbage probe ("100000/1") must not inflate cost; clamp at 240.
    expect(probeFrameRate(mockProbe(640, 360, 'h264', true, '100000/1'))).toBe(
      240,
    );
    // Legitimate high-frame-rate content is preserved.
    expect(probeFrameRate(mockProbe(1920, 1080, 'h264', true, '120/1'))).toBe(
      120,
    );
  });
});

describe('variantsToEncodeCost', () => {
  test('defaults to the 60fps reference (cost == summed area)', () => {
    // 4K source -> 4K + 1080p + 720p + 480p ladder (+ audio, free)
    expect(
      variantsToEncodeCost(getVariants(mockProbe(3840, 2160))),
    ).toBeCloseTo(5.6944, 3);
    // 1080p source -> 1080p + 720p + 480p
    expect(
      variantsToEncodeCost(getVariants(mockProbe(1920, 1080))),
    ).toBeCloseTo(1.6944, 3);
    // 720p source -> 720p + 480p
    expect(variantsToEncodeCost(getVariants(mockProbe(1280, 720)))).toBeCloseTo(
      0.6944,
      3,
    );
  });

  test('scales with frame rate (pixels/second)', () => {
    const variants = getVariants(mockProbe(1920, 1080)); // ~1.6944 area units
    // 30fps content costs half of the 60fps reference -> packs ~2x denser.
    expect(variantsToEncodeCost(variants, 30)).toBeCloseTo(0.8472, 3);
    // 60fps is the reference.
    expect(variantsToEncodeCost(variants, 60)).toBeCloseTo(1.6944, 3);
    // High-fps content costs proportionally more.
    expect(variantsToEncodeCost(variants, 120)).toBeCloseTo(3.3888, 3);
  });

  test('a non-positive frame rate falls back to the reference', () => {
    const variants = getVariants(mockProbe(1920, 1080));
    expect(variantsToEncodeCost(variants, 0)).toBeCloseTo(1.6944, 3);
  });

  test('audio-only uploads cost nothing at any frame rate', () => {
    expect(variantsToEncodeCost(['AUDIO'], 30)).toBe(0);
  });
});

describe('encodeSessionCount', () => {
  test('counts one encoder session per video rendition (audio is free)', () => {
    expect(encodeSessionCount(getVariants(mockProbe(3840, 2160)))).toBe(4); // 4K ladder
    expect(encodeSessionCount(getVariants(mockProbe(1920, 1080)))).toBe(3);
    expect(encodeSessionCount(getVariants(mockProbe(1280, 720)))).toBe(2);
    expect(encodeSessionCount(getVariants(mockProbe(960, 540)))).toBe(1);
    expect(encodeSessionCount(['AUDIO'])).toBe(0);
  });
});

describe('probeToDecodeCost', () => {
  test('costs the source decode by area x frame rate', () => {
    expect(
      probeToDecodeCost(mockProbe(1920, 1080, 'h264', true, '60/1')),
    ).toBeCloseTo(1, 3);
    expect(
      probeToDecodeCost(mockProbe(1920, 1080, 'h264', true, '30/1')),
    ).toBeCloseTo(0.5, 3);
    expect(
      probeToDecodeCost(mockProbe(3840, 2160, 'h264', true, '60/1')),
    ).toBeCloseTo(4, 3);
    // Unknown frame rate falls back to the 60fps reference (conservative).
    expect(probeToDecodeCost(mockProbe(1920, 1080))).toBeCloseTo(1, 3);
  });

  test('audio-only (no video stream) costs nothing', () => {
    const audioProbe = ffprobeSchema.parse({
      streams: [{ index: 0, codec_type: 'audio', codec_name: 'aac' }],
      format: {
        filename: 'a.mp3',
        format_name: 'mp3',
        duration: '100',
        nb_streams: 1,
      },
    });
    expect(probeToDecodeCost(audioProbe)).toBe(0);
  });

  // The decode cost is NOT always <= the encode-ladder cost: between-tier and
  // above-4K sources decode more than their ladder encodes. This is why callers
  // charge max(encode, decode) — these cases would break a charge-encode-only
  // budget. (Guards the AMA device-budget safety invariant.)
  test('can exceed the encode-ladder cost for between-tier / oversized sources', () => {
    // 1440p: decodes 1.778 but its ladder (1080p+720p+480p) encodes ~1.694.
    const p1440 = mockProbe(2560, 1440, 'h264', true, '60/1');
    expect(probeToDecodeCost(p1440)).toBeGreaterThan(
      variantsToEncodeCost(getVariants(p1440), 60),
    );
    // 8K: decodes 16 vs ~5.694 ladder.
    const p8k = mockProbe(7680, 4320, 'h264', true, '60/1');
    expect(probeToDecodeCost(p8k)).toBeCloseTo(16, 3);
    expect(probeToDecodeCost(p8k)).toBeGreaterThan(
      variantsToEncodeCost(getVariants(p8k), 60),
    );
    // Standard tiers, by contrast, encode >= decode (the common case).
    const p1080 = mockProbe(1920, 1080, 'h264', true, '60/1');
    expect(variantsToEncodeCost(getVariants(p1080), 60)).toBeGreaterThanOrEqual(
      probeToDecodeCost(p1080),
    );
  });
});

describe('thumbnailsUseAma / ffmpegThumbnailArgs', () => {
  const prev = process.env.AMA_HW_THUMBNAILS;
  afterEach(() => {
    if (prev === undefined) {
      delete process.env.AMA_HW_THUMBNAILS;
    } else {
      process.env.AMA_HW_THUMBNAILS = prev;
    }
  });

  test('off by default (flag unset) even on an AMA target', () => {
    delete process.env.AMA_HW_THUMBNAILS;
    expect(thumbnailsUseAma(mockProbe(1920, 1080, 'h264'), 'ama:0')).toBe(
      false,
    );
  });

  test('enabled only with the flag + AMA target + hardware-decodable codec', () => {
    process.env.AMA_HW_THUMBNAILS = 'true';
    expect(thumbnailsUseAma(mockProbe(1920, 1080, 'h264'), 'ama:0')).toBe(true);
    expect(thumbnailsUseAma(mockProbe(1920, 1080, 'hevc'), 'ama:0')).toBe(true);
    // Non-AMA target and non-decodable codec both stay on the software path.
    expect(thumbnailsUseAma(mockProbe(1920, 1080, 'h264'), 'none')).toBe(false);
    expect(thumbnailsUseAma(mockProbe(1920, 1080, 'mpeg2video'), 'ama:0')).toBe(
      false,
    );
    // Exactly 4K is allowed; above the decoder's 4K limit stays software.
    expect(thumbnailsUseAma(mockProbe(3840, 2160, 'h264'), 'ama:0')).toBe(true);
    expect(thumbnailsUseAma(mockProbe(7680, 4320, 'h264'), 'ama:0')).toBe(
      false,
    );
  });

  test('software args carry no AMA flags', () => {
    const args = ffmpegThumbnailArgs(
      'in.mp4',
      mockProbe(1920, 1080, 'h264', true, '30/1', '100'),
      'none',
    );
    expect(args).not.toContain('-hwaccel');
    expect(args).not.toContain('jpeg_ama');
    expect(args).toContain('screenshot_v1_%03d.jpg');
    expect(args.join(' ')).toContain('-r 1'); // 100 frames / 100s duration
  });

  test('AMA args hardware-decode the source and JPEG-encode on device', () => {
    process.env.AMA_HW_THUMBNAILS = 'true';
    const args = ffmpegThumbnailArgs(
      'in.mp4',
      mockProbe(1920, 1080, 'h264', true, '30/1', '100'),
      'ama:0',
    );
    const joined = args.join(' ');
    expect(joined).toContain('-hwaccel ama');
    expect(joined).toContain('/dev/ama_transcoder0');
    expect(joined).toContain('-c:v h264_ama');
    expect(joined).toContain('-c:v jpeg_ama');
    expect(args).toContain('screenshot_v1_%03d.jpg');
  });
});

describe('getVariants', () => {
  test('standard resolutions', () => {
    expect(getVariants(mockProbe(3840, 2160))).toMatchInlineSnapshot(`
      [
        "VIDEO_4K",
        "VIDEO_1080P",
        "VIDEO_720P",
        "VIDEO_480P",
        "AUDIO",
      ]
    `);
    expect(getVariants(mockProbe(1920, 1080))).toMatchInlineSnapshot(`
      [
        "VIDEO_1080P",
        "VIDEO_720P",
        "VIDEO_480P",
        "AUDIO",
      ]
    `);
    expect(getVariants(mockProbe(1280, 720))).toMatchInlineSnapshot(`
      [
        "VIDEO_720P",
        "VIDEO_480P",
        "AUDIO",
      ]
    `);
    expect(getVariants(mockProbe(842, 480))).toMatchInlineSnapshot(`
      [
        "AUDIO",
      ]
    `);
  });

  test('non-standard resolutions', () => {
    expect(getVariants(mockProbe(4000, 4000))).toMatchInlineSnapshot(`
      [
        "VIDEO_4K",
        "VIDEO_1080P",
        "VIDEO_720P",
        "VIDEO_480P",
        "AUDIO",
      ]
    `);
    expect(getVariants(mockProbe(2000, 2000))).toMatchInlineSnapshot(`
      [
        "VIDEO_1080P",
        "VIDEO_720P",
        "VIDEO_480P",
        "AUDIO",
      ]
    `);
    expect(getVariants(mockProbe(1000, 1000))).toMatchInlineSnapshot(`
      [
        "VIDEO_720P",
        "VIDEO_480P",
        "AUDIO",
      ]
    `);
    expect(getVariants(mockProbe(500, 500))).toMatchInlineSnapshot(`
      [
        "AUDIO",
      ]
    `);
  });

  test('video without audio stream', () => {
    expect(getVariants(mockProbe(1920, 1080, 'h264', false)))
      .toMatchInlineSnapshot(`
      [
        "VIDEO_1080P",
        "VIDEO_720P",
        "VIDEO_480P",
      ]
    `);
    expect(getVariants(mockProbe(500, 500, 'h264', false)))
      .toMatchInlineSnapshot(`
      []
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
          "VIDEO_720P",
          "VIDEO_480P",
          "AUDIO",
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
          "VIDEO_1080P",
          "VIDEO_720P",
          "VIDEO_480P",
          "AUDIO",
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
        ]
      `);
    });
  });
});

test('variantsToMasterVideoPlaylist', () => {
  expect(variantsToMasterVideoPlaylist(['VIDEO_4K', 'VIDEO_1080P', 'AUDIO']))
    .toMatchInlineSnapshot(`
    "#EXTM3U
    #EXT-X-VERSION:6

    #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="AUDIO.m3u8"

    #EXT-X-STREAM-INF:BANDWIDTH=27492000,RESOLUTION=3840x2160,CODECS="avc1.640033,mp4a.40.2",AUDIO="audio"
    VIDEO_4K.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=7692000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"
    VIDEO_1080P.m3u8
    "
  `);

  expect(
    variantsToMasterVideoPlaylist([
      'VIDEO_1080P',
      'VIDEO_720P',
      'VIDEO_480P',
      'AUDIO',
    ]),
  ).toMatchInlineSnapshot(`
    "#EXTM3U
    #EXT-X-VERSION:6

    #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="AUDIO.m3u8"

    #EXT-X-STREAM-INF:BANDWIDTH=7692000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"
    VIDEO_1080P.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=4392000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="audio"
    VIDEO_720P.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=2292000,RESOLUTION=960x540,CODECS="avc1.64001f,mp4a.40.2",AUDIO="audio"
    VIDEO_480P.m3u8
    "
  `);

  // video-only (no audio stream): no mp4a codec hint, no audio bandwidth,
  // no audio rendition group
  expect(variantsToMasterVideoPlaylist(['VIDEO_720P'])).toMatchInlineSnapshot(`
    "#EXTM3U
    #EXT-X-VERSION:6

    #EXT-X-STREAM-INF:BANDWIDTH=4200000,RESOLUTION=1280x720,CODECS="avc1.64001f"
    VIDEO_720P.m3u8
    "
  `);
});

describe('extraDecodeArgs', () => {
  describe('hwAccel none', () => {
    test('h264', () => {
      expect(
        extraDecodeArgs(mockProbe(1920, 1080, 'h264'), 'none'),
      ).toMatchInlineSnapshot('[]');
    });

    test('hevc', () => {
      expect(
        extraDecodeArgs(mockProbe(1920, 1080, 'hevc'), 'none'),
      ).toMatchInlineSnapshot('[]');
    });

    test('av1', () => {
      expect(
        extraDecodeArgs(mockProbe(1920, 1080, 'av1'), 'none'),
      ).toMatchInlineSnapshot('[]');
    });
  });

  describe('hwAccel ma35d', () => {
    test('h264', () => {
      expect(extraDecodeArgs(mockProbe(1920, 1080, 'h264'), 'ama:0'))
        .toMatchInlineSnapshot(`
          [
            "-hwaccel",
            "ama",
            "-hwaccel_device",
            "/dev/ama_transcoder0",
            "-c:v",
            "h264_ama",
          ]
        `);
    });

    test('hevc', () => {
      expect(extraDecodeArgs(mockProbe(1920, 1080, 'hevc'), 'ama:0'))
        .toMatchInlineSnapshot(`
          [
            "-hwaccel",
            "ama",
            "-hwaccel_device",
            "/dev/ama_transcoder0",
            "-c:v",
            "hevc_ama",
          ]
        `);
    });

    test('av1', () => {
      expect(extraDecodeArgs(mockProbe(1920, 1080, 'av1'), 'ama:0'))
        .toMatchInlineSnapshot(`
          [
            "-hwaccel",
            "ama",
            "-hwaccel_device",
            "/dev/ama_transcoder0",
            "-c:v",
            "av1_ama",
          ]
        `);
    });
  });
});

test('ffmpegEncodingArgs software 4K+1080P', () => {
  expect(
    ffmpegEncodingArgs(
      ['VIDEO_4K', 'VIDEO_1080P', 'AUDIO'],
      mockProbe(3840, 2160),
      'none',
    ),
  ).toMatchInlineSnapshot(`
    [
      "-filter_complex",
      "[0:v]scale=3840:2160:flags=lanczos,setsar=1[VIDEO_4K];[0:v]scale=1920:1080:flags=lanczos,setsar=1[VIDEO_1080P]",
      "-map",
      "[VIDEO_4K]",
      "-an",
      "-c:v",
      "h264",
      "-profile:v",
      "high",
      "-level:v",
      "5.1",
      "-pix_fmt",
      "yuv420p",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-color_range",
      "tv",
      "-force_key_frames",
      "expr:gte(t,n_forced*7)",
      "-sc_threshold",
      "0",
      "-g",
      "1000000",
      "-fps_mode",
      "cfr",
      "-b:v",
      "18200k",
      "-maxrate",
      "27300k",
      "-bufsize",
      "54600k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "VIDEO_4K_init.mp4",
      "-hls_segment_filename",
      "VIDEO_4K_%04d.m4s",
      "VIDEO_4K.m3u8",
      "-map",
      "[VIDEO_1080P]",
      "-an",
      "-c:v",
      "h264",
      "-profile:v",
      "high",
      "-level:v",
      "4.0",
      "-pix_fmt",
      "yuv420p",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-color_range",
      "tv",
      "-force_key_frames",
      "expr:gte(t,n_forced*7)",
      "-sc_threshold",
      "0",
      "-g",
      "1000000",
      "-fps_mode",
      "cfr",
      "-b:v",
      "5000k",
      "-maxrate",
      "7500k",
      "-bufsize",
      "15000k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "VIDEO_1080P_init.mp4",
      "-hls_segment_filename",
      "VIDEO_1080P_%04d.m4s",
      "VIDEO_1080P.m3u8",
      "-map",
      "0:a",
      "-vn",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-b:a",
      "192k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "AUDIO_init.mp4",
      "-hls_segment_filename",
      "AUDIO_%04d.m4s",
      "AUDIO.m3u8",
    ]
  `);
});

test('ffmpegEncodingArgs audio-only', () => {
  expect(ffmpegEncodingArgs(['AUDIO'], mockProbe(0, 0), 'none'))
    .toMatchInlineSnapshot(`
    [
      "-map",
      "0:a",
      "-vn",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-b:a",
      "192k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "AUDIO_init.mp4",
      "-hls_segment_filename",
      "AUDIO_%04d.m4s",
      "AUDIO.m3u8",
    ]
  `);
});

test('ffmpegEncodingArgs ama 4K+1080P h264', () => {
  expect(
    ffmpegEncodingArgs(
      ['VIDEO_4K', 'VIDEO_1080P', 'AUDIO'],
      mockProbe(3840, 2160, 'h264'),
      'ama:0',
    ),
  ).toMatchInlineSnapshot(`
    [
      "-filter_complex",
      "scaler_ama=outputs=2:out_res=(3840x2160)(1920x1080) [VIDEO_4K][VIDEO_1080P]",
      "-map",
      "[VIDEO_4K]",
      "-an",
      "-c:v",
      "h264_ama",
      "-force_key_frames",
      "expr:gte(t,n_forced*7)",
      "-sc_threshold",
      "0",
      "-g",
      "1000000",
      "-fps_mode",
      "cfr",
      "-b:v",
      "18200k",
      "-maxrate",
      "27300k",
      "-bufsize",
      "54600k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "VIDEO_4K_init.mp4",
      "-hls_segment_filename",
      "VIDEO_4K_%04d.m4s",
      "VIDEO_4K.m3u8",
      "-map",
      "[VIDEO_1080P]",
      "-an",
      "-c:v",
      "h264_ama",
      "-force_key_frames",
      "expr:gte(t,n_forced*7)",
      "-sc_threshold",
      "0",
      "-g",
      "1000000",
      "-fps_mode",
      "cfr",
      "-b:v",
      "5000k",
      "-maxrate",
      "7500k",
      "-bufsize",
      "15000k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "VIDEO_1080P_init.mp4",
      "-hls_segment_filename",
      "VIDEO_1080P_%04d.m4s",
      "VIDEO_1080P.m3u8",
      "-map",
      "0:a",
      "-vn",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-b:a",
      "192k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "AUDIO_init.mp4",
      "-hls_segment_filename",
      "AUDIO_%04d.m4s",
      "AUDIO.m3u8",
    ]
  `);
});

test('ffmpegEncodingArgs ama hwupload for non-hw-accelerated codec', () => {
  expect(
    ffmpegEncodingArgs(
      ['VIDEO_4K', 'VIDEO_1080P', 'AUDIO'],
      mockProbe(3840, 2160, 'vp9'),
      'ama:0',
    ),
  ).toMatchInlineSnapshot(`
    [
      "-filter_complex",
      "hwupload,scaler_ama=outputs=2:out_res=(3840x2160)(1920x1080) [VIDEO_4K][VIDEO_1080P]",
      "-map",
      "[VIDEO_4K]",
      "-an",
      "-c:v",
      "h264_ama",
      "-force_key_frames",
      "expr:gte(t,n_forced*7)",
      "-sc_threshold",
      "0",
      "-g",
      "1000000",
      "-fps_mode",
      "cfr",
      "-b:v",
      "18200k",
      "-maxrate",
      "27300k",
      "-bufsize",
      "54600k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "VIDEO_4K_init.mp4",
      "-hls_segment_filename",
      "VIDEO_4K_%04d.m4s",
      "VIDEO_4K.m3u8",
      "-map",
      "[VIDEO_1080P]",
      "-an",
      "-c:v",
      "h264_ama",
      "-force_key_frames",
      "expr:gte(t,n_forced*7)",
      "-sc_threshold",
      "0",
      "-g",
      "1000000",
      "-fps_mode",
      "cfr",
      "-b:v",
      "5000k",
      "-maxrate",
      "7500k",
      "-bufsize",
      "15000k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "VIDEO_1080P_init.mp4",
      "-hls_segment_filename",
      "VIDEO_1080P_%04d.m4s",
      "VIDEO_1080P.m3u8",
      "-map",
      "0:a",
      "-vn",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-b:a",
      "192k",
      "-max_muxing_queue_size",
      "1024",
      "-hls_time",
      "7",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "temp_file",
      "-hls_segment_type",
      "fmp4",
      "-hls_fmp4_init_filename",
      "AUDIO_init.mp4",
      "-hls_segment_filename",
      "AUDIO_%04d.m4s",
      "AUDIO.m3u8",
    ]
  `);
});

describe('ffmpegEncodeArgs', () => {
  // Helper: return the value passed to ffmpeg's -threads flag, or undefined if absent.
  function threadsArg(args: Array<string>): string | undefined {
    const i = args.indexOf('-threads');
    return i === -1 ? undefined : args[i + 1];
  }

  test('software path caps encoder threads (default 12)', () => {
    const args = ffmpegEncodeArgs(
      'input.mp4',
      mockProbe(1920, 1080),
      ['VIDEO_1080P', 'AUDIO'],
      'none',
    );
    // -threads must be present, set to a positive integer, and precede the input.
    expect(threadsArg(args)).toBe('12');
    expect(args.indexOf('-threads')).toBeLessThan(args.indexOf('-i'));
  });

  test('AMA hardware path does not set -threads', () => {
    const args = ffmpegEncodeArgs(
      'input.mp4',
      mockProbe(1920, 1080),
      ['VIDEO_1080P', 'AUDIO'],
      'ama:0',
    );
    expect(threadsArg(args)).toBeUndefined();
  });

  test('passes through input filename and encoding outputs', () => {
    const args = ffmpegEncodeArgs(
      'input.mp4',
      mockProbe(1920, 1080),
      ['VIDEO_1080P', 'AUDIO'],
      'none',
    );
    // input wired correctly
    expect(args[args.indexOf('-i') + 1]).toBe('input.mp4');
    // and the encoding args are appended after the input
    expect(args.indexOf('-filter_complex')).toBeGreaterThan(args.indexOf('-i'));
  });
});

describe('parseM3u8', () => {
  test('extracts segments and hlsTime from TARGETDURATION', () => {
    const m3u8 = [
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      '#EXT-X-TARGETDURATION:6',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-MAP:URI="VIDEO_720P_init.mp4"',
      '#EXTINF:6.000000,',
      'VIDEO_720P_0000.m4s',
      '#EXTINF:6.000000,',
      'VIDEO_720P_0001.m4s',
      '#EXT-X-ENDLIST',
    ].join('\n');
    expect(parseM3u8(m3u8)).toEqual({
      segments: ['VIDEO_720P_0000.m4s', 'VIDEO_720P_0001.m4s'],
      hlsTime: 6,
    });
  });

  test('uses default hlsTime of 7 when TARGETDURATION is absent', () => {
    const m3u8 = '#EXTM3U\nfoo_0000.m4s\n#EXT-X-ENDLIST\n';
    expect(parseM3u8(m3u8)).toEqual({ segments: ['foo_0000.m4s'], hlsTime: 7 });
  });

  test('handles CRLF line endings', () => {
    const m3u8 =
      '#EXTM3U\r\n#EXT-X-TARGETDURATION:8\r\nseg_0000.m4s\r\n#EXT-X-ENDLIST\r\n';
    expect(parseM3u8(m3u8)).toEqual({ segments: ['seg_0000.m4s'], hlsTime: 8 });
  });

  test('returns empty segments for empty/comment-only playlist', () => {
    const m3u8 = '#EXTM3U\n#EXT-X-TARGETDURATION:7\n#EXT-X-ENDLIST\n';
    expect(parseM3u8(m3u8)).toEqual({ segments: [], hlsTime: 7 });
  });

  test('ignores malformed TARGETDURATION', () => {
    const m3u8 = '#EXT-X-TARGETDURATION:abc\nseg.m4s\n';
    expect(parseM3u8(m3u8)).toEqual({ segments: ['seg.m4s'], hlsTime: 7 });
  });
});
