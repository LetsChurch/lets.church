import type { UploadVariant } from '@letschurch/db';
import { invariant } from 'es-toolkit';
import { execa } from 'execa';
import logger from '../util/logger';
import { type Probe, probeIsVideoFile } from './zod';

type UploadVariantValue = (typeof UploadVariant.enumValues)[number];

const moduleLogger = logger.child({ module: 'util/ffmpeg' });

const HLS_TIME = 7;

const BASE_HLS_ARGS = [
  '-hls_time',
  `${HLS_TIME}`,
  '-hls_playlist_type',
  'vod',
  '-hls_flags',
  'temp_file',
  '-hls_segment_type',
  'fmp4',
];

// TODO: remove 360P in future job:
// 1. Delete from database and from object storage
// 2. Remove the value in a migration afterward
type VideoVariant = Exclude<
  UploadVariantValue,
  | 'AUDIO'
  | 'AUDIO_DOWNLOAD'
  | 'VIDEO_360P'
  | 'VIDEO_360P_DOWNLOAD'
  | 'VIDEO_4K_DOWNLOAD'
  | 'VIDEO_1080P_DOWNLOAD'
  | 'VIDEO_720P_DOWNLOAD'
  | 'VIDEO_480P_DOWNLOAD'
>;

export type HwAccel = 'none' | `ama:${number}`;

export function getVariants(probe: Probe): Array<UploadVariantValue> {
  const res: Array<UploadVariantValue> = [];

  const hasVideo = probeIsVideoFile(probe);

  if (hasVideo) {
    const stream = probe.streams.find(
      (s): s is Extract<typeof s, { codec_type: 'video' }> =>
        s.codec_type === 'video',
    );
    invariant(stream, 'Video stream is required');

    if (stream.width >= 3840 || stream.height >= 2160) {
      res.push('VIDEO_4K');
    }

    if (stream.width >= 1920 || stream.height >= 1080) {
      res.push('VIDEO_1080P');
    }

    if (stream.width >= 1280 || stream.height >= 720) {
      res.push('VIDEO_720P');
    }

    if (stream.width >= 960 || stream.height >= 540) {
      res.push('VIDEO_480P');
    }
  }

  if (probe.streams.some((s) => s.codec_type === 'audio')) {
    res.push('AUDIO');
  }

  return res;
}

function videoVariantToKbps(variant: VideoVariant): number {
  if (variant === 'VIDEO_4K') {
    return 18200;
  } else if (variant === 'VIDEO_1080P') {
    return 5000;
  } else if (variant === 'VIDEO_720P') {
    return 2800;
  } else if (variant === 'VIDEO_480P') {
    return 1400;
  } else {
    throw new Error(`Invalid variant: ${String(variant)}`);
  }
}

function videoVariantToDimensions(variant: VideoVariant): [number, number] {
  if (variant === 'VIDEO_4K') {
    return [3840, 2160];
  } else if (variant === 'VIDEO_1080P') {
    return [1920, 1080];
  } else if (variant === 'VIDEO_720P') {
    return [1280, 720];
  } else if (variant === 'VIDEO_480P') {
    return [960, 540];
  } else {
    throw new Error(`Invalid variant: ${String(variant)}`);
  }
}

function videoVariantToAvcCodec(variant: VideoVariant): string {
  if (variant === 'VIDEO_4K') {
    return 'avc1.640033';
  } else if (variant === 'VIDEO_1080P') {
    return 'avc1.640028';
  } else if (variant === 'VIDEO_720P') {
    return 'avc1.64001f';
  } else if (variant === 'VIDEO_480P') {
    return 'avc1.64001f';
  } else {
    throw new Error(`Invalid variant: ${String(variant)}`);
  }
}

function videoVariantToLevel(variant: VideoVariant): string {
  if (variant === 'VIDEO_4K') {
    return '5.1';
  } else if (variant === 'VIDEO_1080P') {
    return '4.0';
  } else if (variant === 'VIDEO_720P') {
    return '3.1';
  } else if (variant === 'VIDEO_480P') {
    return '3.1';
  } else {
    throw new Error(`Invalid variant: ${String(variant)}`);
  }
}

function videoVariantToOutputArgs(
  variant: VideoVariant,
  hwAccel: HwAccel,
  hasAudio: boolean,
): string[] {
  const kbps = videoVariantToKbps(variant);
  const audioMapArgs: string[] = hasAudio ? ['-map', '0:a'] : [];
  const audioCodecArgs: string[] = hasAudio
    ? ['-c:a', 'aac', '-ar', '48000', '-b:a', '192k']
    : [];
  const profileLevelArgs = hwAccel.startsWith('ama:')
    ? []
    : ['-profile:v', 'high', '-level:v', videoVariantToLevel(variant)];
  return [
    '-map',
    `[${variant}]`,
    ...audioMapArgs,
    '-c:v',
    hwAccel.startsWith('ama:') ? 'h264_ama' : 'h264',
    ...profileLevelArgs,
    ...audioCodecArgs,
    '-g',
    '48',
    '-keyint_min',
    '48',
    '-b:v',
    `${kbps}k`,
    '-maxrate',
    `${Math.floor(kbps * 1.5)}k`,
    '-bufsize',
    `${Math.floor(kbps * 3)}k`,
    ...BASE_HLS_ARGS,
    '-hls_fmp4_init_filename',
    `${variant}_init.mp4`,
    '-hls_segment_filename',
    `${variant}_%04d.m4s`,
    `${variant}.m3u8`,
  ];
}

function audioOutputArgs(): string[] {
  return [
    '-map',
    '0:a',
    '-vn',
    '-c:a',
    'aac',
    '-ar',
    '48000',
    '-b:a',
    '192k',
    ...BASE_HLS_ARGS,
    '-hls_fmp4_init_filename',
    'AUDIO_init.mp4',
    '-hls_segment_filename',
    'AUDIO_%04d.m4s',
    'AUDIO.m3u8',
  ];
}

export function variantsToMasterVideoPlaylist(
  variants: Array<UploadVariantValue>,
  hasMuxedAudio = false,
) {
  const videoVariants = variants.filter(
    (v): v is VideoVariant =>
      v.startsWith('VIDEO') && !v.endsWith('_DOWNLOAD') && !v.includes('360P'),
  );

  const hasSeparateAudio = variants.includes('AUDIO');
  const includeAudioCodec = hasSeparateAudio || hasMuxedAudio;

  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', ''];

  for (const v of videoVariants) {
    const kbps = videoVariantToKbps(v);
    const [w, h] = videoVariantToDimensions(v);
    const codec = videoVariantToAvcCodec(v);
    const bandwidth =
      (Math.floor(kbps * 1.5) + (includeAudioCodec ? 192 : 0)) * 1000;
    const codecStr = includeAudioCodec ? `${codec},mp4a.40.2` : codec;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${w}x${h},CODECS="${codecStr}"`,
      `${v}.m3u8`,
    );
  }

  return `${lines.join('\n')}\n`;
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
  variants: Array<UploadVariantValue>,
): Array<string> {
  // TODO: remove 360P, see above
  const videoVariants = variants.filter(
    (v): v is VideoVariant =>
      v.startsWith('VIDEO') && !v.endsWith('_DOWNLOAD') && !v.includes('360P'),
  );

  if (videoVariants.length === 0) {
    return [];
  }

  const filterComplex = videoVariants
    .map((v) => {
      const [w, h] = videoVariantToDimensions(v);
      return `[0:v]scale=${w}:${h}:flags=lanczos,setsar=1[${v}]`;
    })
    .join(';');

  return ['-filter_complex', filterComplex];
}

// TODO: portrait
// TODO: pad https://superuser.com/a/991412
export function ffmpegAmaFilterComplex(
  variants: Array<UploadVariantValue>,
  probe: Probe,
): Array<string> {
  // TODO: remove 360P, see above
  const videoVariants = variants.filter(
    (v): v is VideoVariant =>
      v.startsWith('VIDEO') && !v.endsWith('_DOWNLOAD') && !v.includes('360P'),
  );

  if (videoVariants.length === 0) {
    return [];
  }

  const hwUpload = probe.streams.some((s) =>
    ['h264', 'hevc', 'av1'].includes(s.codec_name as string),
  )
    ? ''
    : 'hwupload,';

  const filterComplex = `${hwUpload}scaler_ama=outputs=${videoVariants.length}:out_res=${videoVariants
    .map((v) => videoVariantToDimensions(v))
    .map((d) => `(${d[0]}x${d[1]})`)
    .join('')} ${videoVariants.map((v) => `[${v}]`).join('')}`;

  return ['-filter_complex', filterComplex];
}

function variantsToOutputMaps(
  variants: Array<UploadVariantValue>,
  hwAccel: HwAccel,
): string[] {
  // TODO: remove 360P, see above
  const videoVariants = variants.filter(
    (v): v is VideoVariant =>
      v.startsWith('VIDEO') && !v.endsWith('_DOWNLOAD') && !v.includes('360P'),
  );

  const hasAudio = variants.includes('AUDIO');

  return [
    ...videoVariants.flatMap((v) =>
      videoVariantToOutputArgs(v, hwAccel, hasAudio),
    ),
    ...(hasAudio ? audioOutputArgs() : []),
  ];
}

export function ffmpegEncodingArgs(
  variants: Array<UploadVariantValue>,
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
  variants: Array<UploadVariantValue>;
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
    { cwd, cancelSignal: signal },
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
    { cwd, cancelSignal: signal },
  );

  moduleLogger.info(`runFfmpegThumbnails: ${proc.spawnargs.join(' ')}`);

  return proc;
}

export function parseM3u8(content: string): {
  segments: string[];
  hlsTime: number;
} {
  const lines = content.split('\n').map((l) => l.trim());
  const segments: string[] = [];
  let hlsTime = 7;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      const val = parseInt(line.slice(22), 10);
      if (!Number.isNaN(val) && val > 0) hlsTime = val;
    } else if (line.length > 0 && !line.startsWith('#')) {
      segments.push(line);
    }
  }

  return { segments, hlsTime };
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
    { cwd, cancelSignal: signal },
  );

  moduleLogger.info(`runFfmpegProbe: ${proc.spawnargs.join(' ')}`);

  return proc;
}
