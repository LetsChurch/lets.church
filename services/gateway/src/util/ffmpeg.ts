import type { UploadVariant } from '@prisma/client';
import { execa } from 'execa';
import invariant from 'tiny-invariant';
import { type Probe, probeIsVideoFile } from './zod';
import logger from './logger';

const moduleLogger = logger.child({ module: 'util/ffmpeg' });

const HLS_TIME = 7;
const BASE_AUDIO_ARGS = ['-c:a', 'aac', '-ar', '48000'];

const BASE_ARGS = [
  '-g',
  '48',
  '-keyint_min',
  '48',
  '-hls_time',
  `${HLS_TIME}`,
  '-hls_playlist_type',
  'vod',
  '-hls_flags',
  'temp_file',
];

// TODO: remove 360P in future job:
// 1. Delete from database and from object storage
// 2. Remove the value in a migration afterward
// 3. Remove shorts for the time being (the platform is more suited toward long-form content)
type VideoVariant = Exclude<
  UploadVariant,
  'AUDIO' | 'AUDIO_DOWNLOAD' | 'VIDEO_360P' | 'VIDEO_360P_DOWNLOAD'
>;

export type HwAccel = 'none' | `ama:${number}`;

export function getVariants(probe: Probe): Array<UploadVariant> {
  const res: Array<UploadVariant> = [];

  const hasVideo = probeIsVideoFile(probe);

  if (hasVideo) {
    const stream = probe.streams.find(
      (s): s is Extract<typeof s, { codec_type: 'video' }> =>
        s.codec_type === 'video',
    );
    invariant(stream);

    if (stream.width >= 3840 || stream.height >= 2160) {
      res.push('VIDEO_4K');
      res.push('VIDEO_4K_DOWNLOAD');
    }

    if (stream.width >= 1920 || stream.height >= 1080) {
      res.push('VIDEO_1080P');
      res.push('VIDEO_1080P_DOWNLOAD');
    }

    if (stream.width >= 1280 || stream.height >= 720) {
      res.push('VIDEO_720P');
      if (res.length === 1) {
        res.push('VIDEO_720P_DOWNLOAD');
      }
    }

    if (stream.width >= 960 || stream.height >= 540) {
      // TODO: replace 480 with 540, in the same job where 360 is deleted
      res.push('VIDEO_480P');
      if (res.length === 1) {
        res.push('VIDEO_480P_DOWNLOAD');
      }
    }
  }

  res.push('AUDIO', 'AUDIO_DOWNLOAD');

  return res;
}

function videoVariantToKbps(variant: VideoVariant) {
  if (variant === 'VIDEO_4K' || variant === 'VIDEO_4K_DOWNLOAD') {
    return 18200;
  } else if (variant === 'VIDEO_1080P' || variant === 'VIDEO_1080P_DOWNLOAD') {
    return 5000;
  } else if (variant === 'VIDEO_720P' || variant === 'VIDEO_720P_DOWNLOAD') {
    return 2800;
  } else if (variant === 'VIDEO_480P' || variant === 'VIDEO_480P_DOWNLOAD') {
    return 1400;
  } else {
    const nope: never = variant;
    throw new Error(`Invalid variant: ${nope}`);
  }
}

function videoVariantToDimensions(variant: VideoVariant): [number, number] {
  if (variant === 'VIDEO_4K' || variant === 'VIDEO_4K_DOWNLOAD') {
    return [3840, 2160];
  } else if (variant === 'VIDEO_1080P' || variant === 'VIDEO_1080P_DOWNLOAD') {
    return [1920, 1080];
  } else if (variant === 'VIDEO_720P' || variant === 'VIDEO_720P_DOWNLOAD') {
    return [1280, 720];
  } else if (variant === 'VIDEO_480P' || variant === 'VIDEO_480P_DOWNLOAD') {
    return [960, 540];
  } else {
    const nope: never = variant;
    throw new Error(`Invalid variant: ${nope}`);
  }
}

function variantToPlaylistName(variant: UploadVariant) {
  return `${variant}.m3u8`;
}

function variantToDownloadName(variant: UploadVariant) {
  return `${variant}.${variant.startsWith('VIDEO') ? 'mp4' : 'm4a'}`;
}

function variantIsVideo(
  v: UploadVariant,
): v is Exclude<UploadVariant, `AUDIO${string}`> {
  return v.startsWith('VIDEO');
}

function variantIsAudio(
  v: UploadVariant,
): v is Extract<UploadVariant, `AUDIO${string}`> {
  return v.startsWith('AUDIO');
}

function videoVariantToBufSize(variant: VideoVariant): string {
  switch (variant) {
    case 'VIDEO_4K':
    case 'VIDEO_4K_DOWNLOAD':
      return '27300k';
    case 'VIDEO_1080P':
    case 'VIDEO_1080P_DOWNLOAD':
      return '7500k';
    case 'VIDEO_720P':
    case 'VIDEO_720P_DOWNLOAD':
      return '4200k';
    case 'VIDEO_480P':
    case 'VIDEO_480P_DOWNLOAD':
      return '2100k';
  }
}

// TODO: remove 360P, see above
function variantToAudioBitRate(
  variant: Exclude<UploadVariant, 'VIDEO_360P' | 'VIDEO_360P_DOWNLOAD'>,
): string {
  switch (variant) {
    case 'VIDEO_4K':
    case 'VIDEO_4K_DOWNLOAD':
    case 'VIDEO_1080P':
    case 'VIDEO_1080P_DOWNLOAD':
    case 'AUDIO':
    case 'AUDIO_DOWNLOAD':
      return '192k';
    case 'VIDEO_720P':
    case 'VIDEO_720P_DOWNLOAD':
    case 'VIDEO_480P':
    case 'VIDEO_480P_DOWNLOAD':
      return '128k';
  }
}

// TODO: remove 360P, see above
function variantToOutputArgs(
  variant: Exclude<UploadVariant, 'VIDEO_360P' | 'VIDEO_360P_DOWNLOAD'>,
) {
  const outputName = variant.endsWith('_DOWNLOAD')
    ? variantToDownloadName(variant)
    : variantToPlaylistName(variant);
  const bvm = variantIsVideo(variant)
    ? [
        '-b:v',
        `${videoVariantToKbps(variant)}k`,
        '-maxrate',
        `${Math.floor(videoVariantToKbps(variant) * 1.07)}k`,
      ]
    : [];
  const bufsize = variantIsVideo(variant)
    ? ['-bufsize', videoVariantToBufSize(variant)]
    : [];
  const audioOnlyOutput = variantIsAudio(variant) ? ['-vn'] : [];
  const segmentFilename = !variant.endsWith('_DOWNLOAD')
    ? ['-hls_segment_filename', `${variant}_%04d.ts`]
    : [];

  return [
    ...BASE_ARGS,
    ...bvm,
    ...bufsize,
    ...audioOnlyOutput,
    '-b:a',
    variantToAudioBitRate(variant),
    ...segmentFilename,
    outputName,
  ];
}

export function variantsToMasterVideoPlaylist(variants: Array<UploadVariant>) {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    ...variants
      // Audio must not be included in the master playlist: https://developer.apple.com/documentation/http_live_streaming/http_live_streaming_hls_authoring_specification_for_apple_devices
      // Don't include downloads in master playlist
      .filter(
        // TODO: remove 360P, see above
        (
          v,
        ): v is Exclude<
          UploadVariant,
          'AUDIO' | `${string}_DOWNLOAD` | 'VIDEO_360P'
        > => v !== 'AUDIO' && !v.endsWith('_DOWNLOAD') && !v.includes('360P'),
      )
      .flatMap((v) => [
        `#EXT-X-STREAM-INF:BANDWIDTH=${
          videoVariantToKbps(v) * 1000
        },RESOLUTION=${videoVariantToDimensions(v).join('x')}`,
        variantToPlaylistName(v),
      ]),
  ].join('\n');
}

export function extraDecodeArgs(probe: Probe, hwAccel: HwAccel) {
  if (hwAccel.startsWith('ama:')) {
    const base = [
      '-hwaccel',
      'ama',
      '-hwaccel_device',
      `/dev/ama_transcoder${hwAccel.split(':').at(-1)}`,
    ];

    if (probe.streams.some((s) => s.codec_name === 'h264')) {
      return [...base, '-c:v', 'h264_ama'];
    }

    if (probe.streams.some((s) => s.codec_name === 'hevc')) {
      return [...base, '-c:v', 'hevc_ama'];
    }

    if (probe.streams.some((s) => s.codec_name === 'av1')) {
      return [...base, '-c:v', 'av1_ama'];
    }

    return base;
  }

  return [];
}

// TODO: portrait
// TODO: pad videos: https://superuser.com/a/991412
export function ffmpegSoftwareFilterComplex(
  variants: Array<UploadVariant>,
): Array<string> {
  // TODO: remove 360P, see above
  const videoVariants = variants.filter(
    (
      v,
    ): v is Exclude<UploadVariant, `AUDIO${string}` | `VIDEO_360P${string}`> =>
      v.startsWith('VIDEO') && !v.includes('360P'),
  );

  if (videoVariants.length === 0) {
    return [];
  }

  // Construct filter_complex
  const resolutions = videoVariants.filter(
    (v): v is Exclude<(typeof videoVariants)[number], `${string}_DOWNLOAD`> =>
      !v.endsWith('_DOWNLOAD'),
  );
  const downloads = videoVariants.filter(
    (v): v is Extract<(typeof videoVariants)[number], `${string}_DOWNLOAD`> =>
      v.endsWith('_DOWNLOAD'),
  );
  const filterComplex = `${resolutions
    .map((r) => videoVariantToDimensions(r))
    // Ensure dimensions are divisible by 2
    .map((d, i) => `[0:v]scale=${d[0]}x${d[1]},setsar=1[${resolutions[i]}]`)
    .join(';')};${downloads
    .map(
      (d) =>
        `[${d.replace('_DOWNLOAD', '')}]split[${d}][${d.replace(
          '_DOWNLOAD',
          '',
        )}]`,
    )
    .join(';')}`;

  return ['-filter_complex', filterComplex];
}

// TODO: portrait
// TODO: pad https://superuser.com/a/991412
export function ffmpegAmaFilterComplex(
  variants: Array<UploadVariant>,
  probe: Probe,
): Array<string> {
  // TODO: remove 360P, see above
  const videoVariants = variants.filter(
    (
      v,
    ): v is Exclude<UploadVariant, `AUDIO${string}` | `VIDEO_360P${string}`> =>
      v.startsWith('VIDEO') && !v.includes('360P'),
  );

  if (videoVariants.length === 0) {
    return [];
  }

  // Construct filter_complex
  const hwUpload = probe.streams.some((s) =>
    ['h264', 'hevc', 'av1'].includes(s.codec_name as string),
  )
    ? ''
    : 'hwupload,';

  const resolutions = videoVariants.filter(
    (v): v is Exclude<(typeof videoVariants)[number], `${string}_DOWNLOAD`> =>
      !v.endsWith('_DOWNLOAD'),
  );
  const downloads = videoVariants.filter(
    (v): v is Extract<(typeof videoVariants)[number], `${string}_DOWNLOAD`> =>
      v.endsWith('_DOWNLOAD'),
  );

  const filterComplex = `${hwUpload}scaler_ama=outputs=${
    resolutions.length
  }:out_res=${resolutions
    .map((r) => videoVariantToDimensions(r))
    .map((d) => `(${d[0]}x${d[1]})`)
    .join('')} ${resolutions.map((r) => `[${r}]`).join('')};${downloads
    .map(
      (d) =>
        `[${d.replace('_DOWNLOAD', '')}]split[${d}][${d.replace(
          '_DOWNLOAD',
          '',
        )}]`,
    )
    .join(';')}`;

  // Construct output maps

  return ['-filter_complex', filterComplex];
}

function variantsToOutputMaps(
  variants: Array<UploadVariant>,
  hwAccel: HwAccel,
) {
  // TODO: remove 360P, see above
  return variants
    .filter(
      (v): v is Exclude<UploadVariant, `VIDEO_360P${string}`> =>
        !v.includes('360P'),
    )
    .flatMap((v) =>
      v.startsWith('VIDEO')
        ? [
            '-map',
            `[${v}]`,
            '-map',
            '0:a',
            ...BASE_AUDIO_ARGS,
            '-c:v',
            hwAccel.startsWith('ama:') ? 'h264_ama' : 'h264',
            ...BASE_ARGS,
            ...variantToOutputArgs(v),
          ]
        : [
            '-map',
            '0:a',
            ...BASE_AUDIO_ARGS,
            ...BASE_ARGS,
            ...variantToOutputArgs(v),
          ],
    );
}

export function ffmpegEncodingArgs(
  variants: Array<UploadVariant>,
  probe: Probe,
  hwAccel: HwAccel,
): Array<string> {
  const filterComplex = hwAccel.startsWith('ama:')
    ? ffmpegAmaFilterComplex(variants, probe)
    : ffmpegSoftwareFilterComplex(variants);
  const outputMaps = variantsToOutputMaps(variants, hwAccel);

  return [...filterComplex, ...outputMaps];
}

export function runFfmpegEncode({
  cwd,
  inputFilename,
  probe,
  variants,
  hwAccel = 'none',
  signal,
}: {
  cwd: string;
  inputFilename: string;
  probe: Probe;
  variants: Array<UploadVariant>;
  hwAccel?: HwAccel;
  signal: AbortSignal;
}) {
  const proc = execa(
    'ffmpeg',
    [
      // Baseline args
      '-hide_banner',
      '-y',
      ...extraDecodeArgs(probe, hwAccel),
      '-i',
      inputFilename,
      // KV output for progress
      '-progress',
      '-',
      // Outputs
      ...ffmpegEncodingArgs(variants, probe, hwAccel),
    ],
    { cwd, signal },
  );

  moduleLogger.info(`runFfmpegEncode: ${proc.spawnargs.join(' ')}`);

  return proc;
}

export function runFfmpegThumbnails(
  cwd: string,
  inputFilename: string,
  probe: Probe,
  signal: AbortSignal,
) {
  const count = 100;
  const rate = 1 / (parseFloat(probe.format.duration) / count);

  const proc = execa(
    'ffmpeg',
    [
      // Baseline args
      '-hide_banner',
      '-y',
      '-i',
      inputFilename,
      // KV output for progress
      '-progress',
      '-',
      // Output
      '-r',
      `${rate}`,
      'screenshot_v1_%03d.jpg',
    ],
    { cwd, signal },
  );

  moduleLogger.info(`runFfmpegThumbnails: ${proc.spawnargs.join(' ')}`);

  return proc;
}

// ffprobe -v quiet -print_format json -show_format -show_streams Stars.mp4
export function runFfprobe(
  cwd: string,
  inputFilename: string,
  signal: AbortSignal,
) {
  const proc = execa(
    'ffprobe',
    [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      /* '-count_frames', */
      inputFilename,
    ],
    { cwd, signal },
  );

  moduleLogger.info(`runFfmpegProbe: ${proc.spawnargs.join(' ')}`);

  return proc;
}
