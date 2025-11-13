import logger from '@letschurch/util';
import { execa } from 'execa';

const moduleLogger = logger.child({ module: 'util/ffmpeg' });

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
