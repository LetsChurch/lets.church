import type { UploadVariant } from '@prisma/client';
import { execa } from 'execa';
import invariant from 'tiny-invariant';
import { type Probe, probeIsVideoFile } from './zod';
import logger from './logger';

const moduleLogger = logger.child({ module: 'util/ffmpeg' });

const HLS_TIME = 7;
const BASE_AUDIO_ARGS = ['-c:a', 'aac', '-ar', '48000'];

const BASE_ARGS = [
  '-sc_threshold',
  '0',
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

type VideoVariant = Exclude<UploadVariant, 'AUDIO' | 'AUDIO_DOWNLOAD'>;

export type HwAccel = 'none' | 'ama';

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

    if (stream.width >= 842 || stream.height >= 480) {
      res.push('VIDEO_480P');
      if (res.length === 1) {
        res.push('VIDEO_480P_DOWNLOAD');
      }
    }

    if (stream.width >= 640 || stream.height >= 360) {
      res.push('VIDEO_360P');
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
  } else if (variant === 'VIDEO_360P' || variant === 'VIDEO_360P_DOWNLOAD') {
    return 800;
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
    return [842, 480];
  } else if (variant === 'VIDEO_360P' || variant === 'VIDEO_360P_DOWNLOAD') {
    return [640, 360];
  } else {
    const nope: never = variant;
    throw new Error(`Invalid variant: ${nope}`);
  }
}

function videoVariantToFfmpegScaleFilter(v: VideoVariant) {
  const [width, _height] = videoVariantToDimensions(v);

  // Ensure dimensions are divisible by 2
  // https://stackoverflow.com/a/29582287/355325
  return ['-vf', `scale=${width}:-2`];
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

function videoVariantToBufSize(
  variant: Exclude<UploadVariant, `AUDIO${string}`>,
): string {
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
    case 'VIDEO_360P':
    case 'VIDEO_360P_DOWNLOAD':
      return '1200k';
  }
}

function variantToAudioBitRate(variant: UploadVariant): string {
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
    case 'VIDEO_360P':
    case 'VIDEO_360P_DOWNLOAD':
      return '96k';
  }
}

function variantToOutputArgs(variant: UploadVariant) {
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
        (v): v is Exclude<UploadVariant, 'AUDIO' | `${string}_DOWNLOAD`> =>
          v !== 'AUDIO' && !v.endsWith('_DOWNLOAD'),
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
  if (hwAccel === 'ama') {
    const base = ['-hwaccel', 'ama'];

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

// TODO: 60fps and portrait
export function ffmpegSoftwareEncodingOutputArgs(
  variants: Array<UploadVariant>,
): Array<string> {
  const videoCodec = ['-c:v', 'h264', '-profile:v', 'main'];
  return variants.flatMap((v) => {
    const isVideo = v !== 'AUDIO' && v !== 'AUDIO_DOWNLOAD';
    const scaleFilter = isVideo ? videoVariantToFfmpegScaleFilter(v) : [];

    switch (v) {
      case 'VIDEO_4K':
        return [
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'VIDEO_4K_DOWNLOAD':
        return [
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'VIDEO_1080P':
        return [
          // Download
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'VIDEO_1080P_DOWNLOAD':
        return [
          // Download
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'VIDEO_720P':
        return [
          // Download
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'VIDEO_720P_DOWNLOAD':
        return [
          // Download
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'VIDEO_480P':
        return [
          // Download
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'VIDEO_480P_DOWNLOAD':
        return [
          // Download
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'VIDEO_360P':
        return [
          // Download
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'VIDEO_360P_DOWNLOAD':
        return [
          // Download
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...videoCodec,
          '-crf',
          '20',
          ...variantToOutputArgs(v),
        ];
      case 'AUDIO':
        return ['-crf', '20', ...BASE_AUDIO_ARGS, ...variantToOutputArgs(v)];
      case 'AUDIO_DOWNLOAD':
        return ['-crf', '20', ...BASE_AUDIO_ARGS, ...variantToOutputArgs(v)];
      default:
        const c: never = v;
        throw new Error(`Unknown variant kind: ${c}`);
    }
  });
}

// TODO: 60fps and portrait
export function ffmpegAmaEncodingOutputArgs(
  variants: Array<UploadVariant>,
  probe: Probe,
): Array<string> {
  const videoVariants = variants.filter(
    (v): v is Exclude<UploadVariant, `AUDIO${string}`> => v.startsWith('VIDEO'),
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

  const filterComplex = `${hwUpload}scaler_ama=outputs=${
    resolutions.length
  }:out_res=${resolutions
    .map((r) => videoVariantToDimensions(r))
    .map((d) => `(${d[0]}x${d[1]})`)} ${resolutions.map((r) => `[${r}]`)}`;

  // Construct output maps
  const maps = videoVariants.flatMap((v) =>
    v.startsWith('VIDEO')
      ? [
          '-map',
          `[${v.replace('_DOWNLOAD', '')}]`,
          '-map',
          '0:a',
          ...BASE_AUDIO_ARGS,
          '-c:v',
          'h264_ama',
          '-profile:v',
          'main',
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

  return ['-filter_complex', filterComplex, ...maps];
}

export function ffmpegEncodingOutputArgs(
  variants: Array<UploadVariant>,
  probe: Probe,
  hwAccel: HwAccel,
): Array<string> {
  const videoOutputArgs =
    hwAccel === 'ama'
      ? ffmpegAmaEncodingOutputArgs(variants, probe)
      : ffmpegSoftwareEncodingOutputArgs(variants);
  const audioOutputArgs: string[] = [];

  return [...videoOutputArgs, ...audioOutputArgs];
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
      ...ffmpegEncodingOutputArgs(variants, probe, hwAccel),
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
