import type { UploadVariant } from '@prisma/client';
import { execa } from 'execa';

const HLS_TIME = 6;

const BASE_AUDIO_ARGS = ['-c:a', 'aac', '-ar', '48000'];

const BASE_VIDEO_ARGS = ['-c:v', 'h264', '-profile:v', 'main'];

const BASE_ARGS = [
  '-crf',
  '20',
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

type VideoVariant = Exclude<UploadVariant, 'AUDIO'>;

export function getVariants(
  inputWidth: number,
  inputHeight: number,
): Array<UploadVariant> {
  const res: Array<UploadVariant> = ['AUDIO'];

  if (inputWidth >= 3840 || inputHeight >= 2160) {
    res.push('VIDEO_4K');
  }

  if (inputWidth >= 1920 || inputHeight >= 1080) {
    res.push('VIDEO_1080P');
  }

  if (inputWidth >= 1280 || inputHeight >= 720) {
    res.push('VIDEO_720P');
  }

  if (inputWidth >= 842 || inputHeight >= 480) {
    res.push('VIDEO_480P');
  }

  if (inputWidth >= 640 || inputHeight >= 360) {
    res.push('VIDEO_360P');
  }

  return res;
}

function videoVariantToKbps(variant: VideoVariant) {
  switch (variant) {
    case 'VIDEO_4K':
      return 18200;
    case 'VIDEO_1080P':
      return 5000;
    case 'VIDEO_720P':
      return 2800;
    case 'VIDEO_480P':
      return 1400;
    case 'VIDEO_360P':
      return 800;
    default:
      const nope: never = variant;
      throw new Error(`Invalid variant: ${nope}`);
  }
}

function videoVariantToDimensions(variant: VideoVariant): [number, number] {
  switch (variant) {
    case 'VIDEO_4K':
      return [3840, 2160];
    case 'VIDEO_1080P':
      return [1920, 1080];
    case 'VIDEO_720P':
      return [1280, 720];
    case 'VIDEO_480P':
      return [842, 480];
    case 'VIDEO_360P':
      return [640, 360];
    default:
      const nope: never = variant;
      throw new Error(`Invalid variant: ${nope}`);
  }
}

function videoVariantToFfmpegScaleFilter(v: VideoVariant) {
  const [width, height] = videoVariantToDimensions(v);

  return [
    '-vf',
    `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease`,
  ];
}

function variantToPlaylistName(variant: UploadVariant) {
  return `${variant}.m3u8`;
}

export function variantsToMasterVideoPlaylist(variants: Array<UploadVariant>) {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    ...variants
      // Audio must not be included in the master playlist: https://developer.apple.com/documentation/http_live_streaming/http_live_streaming_hls_authoring_specification_for_apple_devices
      .filter((v): v is Exclude<UploadVariant, 'AUDIO'> => v !== 'AUDIO')
      .flatMap((v) => [
        `#EXT-X-STREAM-INF:BANDWIDTH=${
          videoVariantToKbps(v) * 1000
        },RESOLUTION=${videoVariantToDimensions(v).join('x')}`,
        variantToPlaylistName(v),
      ]),
  ].join('\n');
}

// TODO: 60fps and portrait
export function ffmpegEncodingOutputArgs(
  variants: Array<UploadVariant>,
): Array<string> {
  return variants.flatMap((v) => {
    const scaleFilter = v !== 'AUDIO' ? videoVariantToFfmpegScaleFilter(v) : [];
    const bvm =
      v !== 'AUDIO'
        ? [
            '-b:v',
            `${videoVariantToKbps(v)}k`,
            '-maxrate',
            `${Math.floor(videoVariantToKbps(v) * 1.07)}k`,
          ]
        : [];
    const playlistName = variantToPlaylistName(v);

    switch (v) {
      case 'VIDEO_4K':
        return [
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          ...bvm,
          '-bufsize',
          '27300k',
          '-b:a',
          '192k',
          '-hls_segment_filename',
          'VIDEO_4K_%04d.ts',
          playlistName,
        ];
      case 'VIDEO_1080P':
        return [
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          ...bvm,
          '-bufsize',
          '7500k',
          '-b:a',
          '192k',
          '-hls_segment_filename',
          'VIDEO_1080P_%04d.ts',
          playlistName,
        ];
      case 'VIDEO_720P':
        return [
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          ...bvm,
          '-bufsize',
          '4200k',
          '-b:a',
          '128k',
          '-hls_segment_filename',
          'VIDEO_720P_%04d.ts',
          playlistName,
        ];
      case 'VIDEO_480P':
        return [
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          ...bvm,
          '-bufsize',
          '2100k',
          '-b:a',
          '128k',
          '-hls_segment_filename',
          'VIDEO_480P_%04d.ts',
          playlistName,
        ];
      case 'VIDEO_360P':
        return [
          ...scaleFilter,
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          ...bvm,
          '-bufsize',
          '1200k',
          '-b:a',
          '96k',
          '-hls_segment_filename',
          'VIDEO_360P_%04d.ts',
          playlistName,
        ];
      case 'AUDIO':
        return [
          ...BASE_ARGS,
          ...BASE_AUDIO_ARGS,
          '-vn',
          '-b:a',
          '192k',
          '-hls_segment_filename',
          'AUDIO_%04d.ts',
          playlistName,
        ];
      default:
        const c: never = v;
        throw new Error(`Unknown variant kind: ${c}`);
    }
  });
}

export function runFfmpegEncode(
  cwd: string,
  inputFilename: string,
  variants: Array<UploadVariant>,
  signal: AbortSignal,
) {
  return execa(
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
      // Outputs
      ...ffmpegEncodingOutputArgs(variants),
    ],
    { cwd, signal },
  );
}

export function runFfmpegThumbnails(
  cwd: string,
  inputFilename: string,
  signal: AbortSignal,
) {
  return execa(
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
      '-vsync', // '-fps_mode',
      'vfr',
      '-vf',
      'fps=fps=1',
      '%05d.jpg',
    ],
    { cwd, signal },
  );
}

// ffprobe -v quiet -print_format json -show_format -show_streams Stars.mp4
export function runFfprobe(
  cwd: string,
  inputFilename: string,
  signal: AbortSignal,
) {
  return execa(
    'ffprobe',
    [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      inputFilename,
    ],
    { cwd, signal },
  );
}
