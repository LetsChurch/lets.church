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

function ffmpegScaleFilter(width: number, height: number) {
  return `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease`;
}

enum MediaVariant {
  VIDEO_4K = '4k',
  VIDEO_1080P = '1080p',
  VIDEO_720P = '720p',
  VIDEO_480P = '480p',
  VIDEO_360P = '360p',
  AUDIO = 'audio',
}

export function getVariantKinds(
  inputWidth: number,
  inputHeight: number,
): Array<MediaVariant> {
  const res: Array<MediaVariant> = [MediaVariant.AUDIO];

  if (inputWidth >= 3840 || inputHeight >= 2160) {
    /* res.push(MediaVariant['VIDEO_4K']); */
    res.push(MediaVariant.VIDEO_4K);
  }

  if (inputWidth >= 1920 || inputHeight >= 1080) {
    res.push(MediaVariant.VIDEO_1080P);
  }

  if (inputWidth >= 1280 || inputHeight >= 720) {
    res.push(MediaVariant.VIDEO_720P);
  }

  if (inputWidth >= 842 || inputHeight >= 480) {
    res.push(MediaVariant.VIDEO_480P);
  }

  if (inputWidth >= 640 || inputHeight >= 360) {
    res.push(MediaVariant.VIDEO_360P);
  }

  return res;
}

// TODO: 60fps and portrait
function ffmpegEncodingOutputArgs(
  variants: Array<MediaVariant>,
): Array<string> {
  return variants.flatMap((v) => {
    switch (v) {
      case MediaVariant.VIDEO_4K:
        return [
          '-vf',
          ffmpegScaleFilter(3840, 2160),
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          '-b:v',
          '18200k',
          '-maxrate',
          '19474k',
          '-bufsize',
          '27300k',
          '-b:a',
          '192k',
          '-hls_segment_filename',
          'VIDEO_4K_%04d.ts',
          'VIDEO_4K.m3u8',
        ];
      case MediaVariant.VIDEO_1080P:
        return [
          '-vf',
          ffmpegScaleFilter(1920, 1080),
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          '-b:v',
          '5000k',
          '-maxrate',
          '5350k',
          '-bufsize',
          '7500k',
          '-b:a',
          '192k',
          '-hls_segment_filename',
          'VIDEO_1080P_%04d.ts',
          'VIDEO_1080P.m3u8',
        ];
      case MediaVariant.VIDEO_720P:
        return [
          '-vf',
          ffmpegScaleFilter(1280, 720),
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          '-b:v',
          '5000k',
          '-maxrate',
          '5350k',
          '-bufsize',
          '4200k',
          '-b:a',
          '128k',
          '-hls_segment_filename',
          'VIDEO_720P_%04d.ts',
          'VIDEO_720P.m3u8',
        ];
      case MediaVariant.VIDEO_480P:
        return [
          '-vf',
          ffmpegScaleFilter(842, 480),
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          '-b:v',
          '1400k',
          '-maxrate',
          '1498k',
          '-bufsize',
          '2100k',
          '-b:a',
          '128k',
          '-hls_segment_filename',
          'VIDEO_480P_%04d.ts',
          'VIDEO_480P.m3u8',
        ];
      case MediaVariant.VIDEO_360P:
        return [
          '-vf',
          ffmpegScaleFilter(640, 360),
          ...BASE_AUDIO_ARGS,
          ...BASE_VIDEO_ARGS,
          ...BASE_ARGS,
          '-b:v',
          '800k',
          '-maxrate',
          '856k',
          '-bufsize',
          '1200k',
          '-b:a',
          '96k',
          '-hls_segment_filename',
          'VIDEO_360P_%04d.ts',
          'VIDEO_360P.m3u8',
        ];
      case MediaVariant.AUDIO:
        return [
          ...BASE_ARGS,
          ...BASE_AUDIO_ARGS,
          '-vn',
          '-b:a',
          '192k',
          '-hls_segment_filename',
          'AUDIO_%04d.ts',
          'AUDIO.m3u8',
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
  variants: Array<MediaVariant>,
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
    { cwd },
  );
}

export function runFfmpegThumbnails(cwd: string, inputFilename: string) {
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
    { cwd },
  );
}

export function concatThumbs(cwd: string, inputFileNames: Array<string>) {
  return execa('convert', [...inputFileNames, '-append', 'hovernail.jpg'], {
    cwd,
  });
}

// ffprobe -v quiet -print_format json -show_format -show_streams Stars.mp4
export function runFfprobe(cwd: string, inputFilename: string) {
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
    { cwd },
  );
}
