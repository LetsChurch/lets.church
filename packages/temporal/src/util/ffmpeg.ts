import type { UploadVariant } from '@letschurch/db';
import { invariant } from 'es-toolkit';
import { execa } from 'execa';
import logger from '../util/logger';
import { type Probe, probeIsVideoFile } from './zod';

type UploadVariantValue = (typeof UploadVariant.enumValues)[number];

const moduleLogger = logger.child({ module: 'util/ffmpeg' });

const HLS_TIME = 7;

// Cap CPU encoder threads for the software path so a single ffmpeg job doesn't try
// to grab the whole node and thrash. Should match the transcode-worker cpu limit in
// the k8s manifests (infra repo, transcode-worker component: TRANSCODE_THREADS / cpu).
// 0 (or unset -> default) lets ffmpeg auto-detect. Not applied to the AMA hardware path.
const SOFTWARE_THREADS = Number(process.env.TRANSCODE_THREADS ?? 12);

const BASE_HLS_ARGS = [
  // Defensive: avoid "Too many packets buffered for output stream"
  // muxer failures on inputs with large interleaving gaps. Applies to
  // every HLS output (each video variant + audio).
  '-max_muxing_queue_size',
  '1024',
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

// --- AMA encode-budget cost model -----------------------------------------
//
// The MA35D's binding constraint when transcoding (in H.264 / "single density",
// which is what we emit — AVC, not AV1 Type-1) is the *encoder*, whose per-device
// aggregate throughput is fixed silicon measured in pixels/second (~1x4Kp60 ==
// 4x1080p60 per engine). XRM enforces this hard: oversubscribing a device makes
// jobs fail with "Insufficient resources available for allocation", not slow
// down — so cost must track real pixels/second and the budget must stay at/below
// true device capacity.
//
// A single transcode job here encodes a whole HLS ladder at once (e.g. a 4K
// source -> 4K + 1080p + 720p + 480p renditions), so a job's cost is the SUM of
// its renditions, each weighted by:
//   - output pixel area, relative to 1080p (a 4K rung is 4x a 1080p rung), and
//   - frame rate, relative to 60fps (a 60fps stream is ~2x the encoder load of
//     the same stream at 30fps). The ladder preserves source fps (`-fps_mode
//     cfr`, no `-r`), so the source frame rate is the multiplier.
// The result is in "1080p60-equivalent" units == pixels/second / (1080p60).
//
// Audio (and any non-video / download variant) doesn't touch the video encoder,
// so it costs nothing. See `util/ama-budget.ts` for how this is enforced.
const ONE_EIGHTY_P_PIXELS = 1920 * 1080;
const REFERENCE_FRAME_RATE = 60;

export function variantEncodeUnits(variant: UploadVariantValue): number {
  switch (variant) {
    case 'VIDEO_4K':
    case 'VIDEO_1080P':
    case 'VIDEO_720P':
    case 'VIDEO_480P': {
      const [width, height] = videoVariantToDimensions(variant);
      return (width * height) / ONE_EIGHTY_P_PIXELS;
    }
    default:
      return 0;
  }
}

// Parses an ffprobe frame-rate rational ("30000/1001", "30/1"). Returns null for
// missing/zero/degenerate values (e.g. "0/0" on VFR sources).
export function parseFrameRate(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const [num, den] = value.split('/').map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num <= 0) {
    return null;
  }
  return num / den;
}

// Source frame rate for cost weighting. Prefers avg_frame_rate, falls back to
// r_frame_rate, then to the 60fps reference — an unknown rate costs the full
// (worst-case) area so we under-pack rather than risk oversubscribing.
export function probeFrameRate(probe: Probe): number {
  const video = probe.streams.find((s) => s.codec_type === 'video');
  if (!video) {
    return REFERENCE_FRAME_RATE;
  }
  return (
    parseFrameRate(video.avg_frame_rate) ??
    parseFrameRate(video.r_frame_rate) ??
    REFERENCE_FRAME_RATE
  );
}

export function variantsToEncodeCost(
  variants: Array<UploadVariantValue>,
  frameRate: number = REFERENCE_FRAME_RATE,
): number {
  const area = variants.reduce(
    (sum, variant) => sum + variantEncodeUnits(variant),
    0,
  );
  const fps = frameRate > 0 ? frameRate : REFERENCE_FRAME_RATE;
  return area * (fps / REFERENCE_FRAME_RATE);
}

// Cost of DECODING the source once, in the same 1080p60-equivalent units as
// `variantsToEncodeCost` — the source's own pixel area x frame rate. Used to
// budget AMA work that exercises the decoder: thumbnail extraction (decode
// only) and the decode half of a transcode. Note this can EXCEED a job's
// encode-ladder cost (a 1440p source decodes ~1.78 units but its ladder tops
// out at 1080p), which is why callers charge `max(encode, decode)` rather than
// assuming encode dominates — see util/ama-budget.ts. Audio-only uploads have
// no video stream and cost nothing.
export function probeToDecodeCost(probe: Probe, frameRate?: number): number {
  const video = probe.streams.find(
    (s): s is Extract<typeof s, { codec_type: 'video' }> =>
      s.codec_type === 'video',
  );
  if (!video) {
    return 0;
  }
  const fps = frameRate ?? probeFrameRate(probe);
  const safeFps = fps > 0 ? fps : REFERENCE_FRAME_RATE;
  return (
    ((video.width * video.height) / ONE_EIGHTY_P_PIXELS) *
    (safeFps / REFERENCE_FRAME_RATE)
  );
}

// Resolve the configured hardware-accel target (e.g. `ama:0`) from the
// environment. Shared by the transcode and thumbnail activities so they agree
// on which path they're running.
export function resolveHwAccel(): HwAccel {
  const env = process.env.TRANSCODE_HW_ACCEL;
  return env?.startsWith('ama:') ? (env as HwAccel) : 'none';
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
): string[] {
  const kbps = videoVariantToKbps(variant);
  // `-profile:v` / `-level:v` are libx264-only; the AMA encoder manages
  // profile/level itself and doesn't take these flags.
  const profileLevelArgs = hwAccel.startsWith('ama:')
    ? []
    : ['-profile:v', 'high', '-level:v', videoVariantToLevel(variant)];

  // Pixel format + color, software path ONLY. `-pix_fmt yuv420p` forces
  // 8-bit 4:2:0 so 10-bit / 4:2:2 / 4:4:4 sources stay broadly decodable
  // (Safari, iOS, smart TVs); the color flags TAG (not convert) — fine
  // for typical bt709 HD uploads, though genuine bt601/SD sources would
  // need a real colorspace conversion.
  //
  // These must NOT be set on the AMA path. `scaler_ama` emits on-device
  // hardware surfaces (pixel format `vpe`) that `h264_ama` consumes
  // directly; requesting `-pix_fmt yuv420p` makes ffmpeg splice an
  // auto_scale filter to convert `vpe -> yuv420p`, which has no on-device
  // implementation and aborts the graph ("Impossible to convert between
  // the formats supported by 'scaler_ama' and 'auto_scale'", error -38).
  // The AMA encoder manages pixel format and carries input color metadata
  // itself, so we leave these off entirely.
  const formatColorArgs = hwAccel.startsWith('ama:')
    ? []
    : [
        '-pix_fmt',
        'yuv420p',
        '-colorspace',
        'bt709',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        '-color_range',
        'tv',
      ];
  return [
    '-map',
    `[${variant}]`,
    // Video carries no audio — audio is a single shared fMP4 rendition
    // (see audioOutputArgs) referenced from the master playlist, so it's
    // encoded/stored once instead of muxed into every video variant.
    '-an',
    '-c:v',
    hwAccel.startsWith('ama:') ? 'h264_ama' : 'h264',
    ...profileLevelArgs,
    ...formatColorArgs,
    // Pin an IDR to the HLS segment grid + disable scene-cut / open GOP
    // so every segment is exactly HLS_TIME long. The separate AUDIO
    // rendition is cut on the same grid, keeping the two aligned to
    // within the constant B-frame reorder offset. -fps_mode cfr so the
    // time-based force_key_frames expression maps to even boundaries
    // even on variable-frame-rate sources.
    '-force_key_frames',
    `expr:gte(t,n_forced*${HLS_TIME})`,
    '-sc_threshold',
    '0',
    '-g',
    '1000000',
    '-fps_mode',
    'cfr',
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
) {
  const videoVariants = variants.filter(
    (v): v is VideoVariant =>
      v.startsWith('VIDEO') && !v.endsWith('_DOWNLOAD') && !v.includes('360P'),
  );

  // Audio is a single shared fMP4 rendition (AUDIO.m3u8), not muxed into
  // the video segments. Reference it as an `#EXT-X-MEDIA` group so the
  // player fetches it once regardless of the selected video quality. The
  // sync that makes this safe comes from the forced-on-grid keyframes in
  // `videoVariantToOutputArgs`.
  const hasAudio = variants.includes('AUDIO');

  // fMP4 segments + audio rendition groups require HLS v6.
  const lines = ['#EXTM3U', '#EXT-X-VERSION:6', ''];

  if (hasAudio) {
    lines.push(
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="AUDIO.m3u8"',
      '',
    );
  }

  for (const v of videoVariants) {
    const kbps = videoVariantToKbps(v);
    const [w, h] = videoVariantToDimensions(v);
    const codec = videoVariantToAvcCodec(v);
    const bandwidth = (Math.floor(kbps * 1.5) + (hasAudio ? 192 : 0)) * 1000;
    const codecStr = hasAudio ? `${codec},mp4a.40.2` : codec;
    const audioAttr = hasAudio ? ',AUDIO="audio"' : '';
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${w}x${h},CODECS="${codecStr}"${audioAttr}`,
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
    ...videoVariants.flatMap((v) => videoVariantToOutputArgs(v, hwAccel)),
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

export function ffmpegEncodeArgs(
  inputFilename: string,
  probe: Probe,
  variants: Array<UploadVariantValue>,
  hwAccel: HwAccel,
): Array<string> {
  return [
    // Baseline args
    '-hide_banner',
    '-y',
    // Software path only: cap encoder threads to the cgroup CPU budget so x264
    // doesn't spawn one thread per host core and fight the scheduler. AMA offloads
    // encoding to hardware, so leave its threading alone.
    ...(hwAccel === 'none' && SOFTWARE_THREADS > 0
      ? ['-threads', String(SOFTWARE_THREADS)]
      : []),
    ...extraDecodeArgs(probe, hwAccel),
    '-i',
    inputFilename,
    // KV output for progress
    '-progress',
    '-',
    // Outputs
    ...ffmpegEncodingArgs(variants, probe, hwAccel),
  ];
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
    ffmpegEncodeArgs(inputFilename, probe, variants, hwAccel),
    { cwd, cancelSignal: signal },
  );

  moduleLogger.info(`runFfmpegEncode: ${proc.spawnargs.join(' ')}`);

  return proc;
}

const THUMBNAIL_COUNT = 100;

// The AMA decoder/scaler tops out at 4K (3840x2160); larger sources can't run
// the hardware path.
const AMA_MAX_WIDTH = 3840;
const AMA_MAX_HEIGHT = 2160;

export function thumbnailRate(probe: Probe): number {
  const duration = parseFloat(probe.format.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    // Degenerate/unknown duration: fall back to ~1fps rather than emit a
    // broken `-r Infinity` / `-r NaN`. Real video probes always carry a
    // positive duration, so this is just a safety net.
    return 1;
  }
  return THUMBNAIL_COUNT / duration;
}

// Whether thumbnail extraction should run on AMA hardware. Requires the opt-in
// `AMA_HW_THUMBNAILS` flag (the exact decode->jpeg_ama graph needs validating on
// real hardware before it's the default), an AMA target, a hardware decoder for
// the source codec, and a source within the device's 4K decode limit. We reuse
// `extraDecodeArgs` so the codec support list lives in exactly one place: if it
// chose a `-c:v *_ama` decoder, the source is hardware-decodable.
export function thumbnailsUseAma(probe: Probe, hwAccel: HwAccel): boolean {
  if (process.env.AMA_HW_THUMBNAILS !== 'true' || !hwAccel.startsWith('ama:')) {
    return false;
  }
  if (!extraDecodeArgs(probe, hwAccel).includes('-c:v')) {
    return false;
  }
  const video = probe.streams.find(
    (s): s is Extract<typeof s, { codec_type: 'video' }> =>
      s.codec_type === 'video',
  );
  return (
    !!video && video.width <= AMA_MAX_WIDTH && video.height <= AMA_MAX_HEIGHT
  );
}

export function ffmpegThumbnailArgs(
  inputFilename: string,
  probe: Probe,
  hwAccel: HwAccel,
): Array<string> {
  const rate = thumbnailRate(probe);

  if (thumbnailsUseAma(probe, hwAccel)) {
    return [
      '-hide_banner',
      '-y',
      // Hardware-decode the source on the AMA device (the expensive part).
      ...extraDecodeArgs(probe, hwAccel),
      '-i',
      inputFilename,
      '-progress',
      '-',
      '-r',
      `${rate}`,
      // Encode the sampled frames with the on-device JPEG encoder so the whole
      // decode->jpeg pipeline stays on the card and off the host CPU.
      '-c:v',
      'jpeg_ama',
      'screenshot_v1_%03d.jpg',
    ];
  }

  return [
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
  ];
}

export function runFfmpegThumbnails(
  cwd: string,
  inputFilename: string,
  probe: Probe,
  signal: AbortSignal,
  hwAccel: HwAccel = 'none',
) {
  const proc = execa(
    'ffmpeg',
    ffmpegThumbnailArgs(inputFilename, probe, hwAccel),
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
