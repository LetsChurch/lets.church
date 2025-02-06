import { extname, join } from 'node:path';
import invariant from 'tiny-invariant';
import { noop } from 'lodash-es';
import { execa } from 'execa';
import type { Logger } from '../logger';
import { downloadUrl } from './download';
import { ytdlp } from './yt-dlp';
import { extractSubsplashM3u8 } from './subsplash';

export type DownloadResult = {
  mediaPath: string;
  thumbnailPath: string | null;
};

export async function downloadFromUrl(
  input: string | URL,
  {
    dir,
    logger,
    heartbeat = noop,
    trimSilence = false,
  }: {
    dir: string;
    logger: Logger;
    heartbeat?: typeof noop;
    trimSilence?: boolean;
  },
): Promise<DownloadResult> {
  const url = new URL(input);

  let mediaPath: string;
  let thumbnailPath: string | null = null;

  if (/\.(mp3|m4a|mp4)$/.test(url.pathname)) {
    mediaPath = await downloadUrl(url, dir, logger, heartbeat);
  } else if (new URL(url).hostname === 'subsplash.com') {
    const m3u8Url = await extractSubsplashM3u8(url, logger);
    invariant(m3u8Url, 'Missing m3u8 url (TODO)');
    const res = await ytdlp(m3u8Url, dir, logger, heartbeat);
    mediaPath = res.mediaPath;
  } else {
    const res = await ytdlp(url, dir, logger, heartbeat);
    mediaPath = res.mediaPath;
    thumbnailPath = res.thumbnailPath;
  }

  if (trimSilence) {
    const ffmpeg = execa('ffmpeg', [
      '-i',
      mediaPath,
      '-af',
      'silencedetect=noise=0.0001',
      '-f',
      'null',
      '-',
    ]);

    const stderr: Array<string> = [];

    ffmpeg.stdout?.on('data', () =>
      heartbeat(`ffmpeg silencedetect stdout ${url}`),
    );
    ffmpeg.stderr?.on('data', (str) => {
      heartbeat(`ffmpeg silencedetect stderr ${url}`);
      stderr.push(String(str));
    });

    const { exitCode: detectExitCode } = await ffmpeg;
    invariant(detectExitCode === 0, `ffmpeg failed: ${stderr}`);

    const matches = Array.from(
      stderr
        .join('')
        .matchAll(/silence_(?<com>start|end): (?<cut>\d+(?:\.\d+)?)/g),
    );

    if (matches.length > 0) {
      const firstEnd = matches.find((m) => m.groups?.['com'] === 'end')?.at(-1);
      const lastStart = matches
        .findLast((m) => m.groups?.['com'] === 'start')
        ?.at(-1);

      const ext = extname(mediaPath);
      const out = join(dir, `trimmed${ext}`);
      const trimmedRes = await execa(
        `ffmpeg`,
        [
          '-i',
          mediaPath,
          ...(firstEnd || lastStart ? ['-ss', firstEnd ?? '0'] : []),
          ...(lastStart && firstEnd && lastStart > firstEnd
            ? ['-to', lastStart]
            : []),
          '-c:v',
          'copy',
          '-c:a',
          'copy',
          out,
        ],
        { cwd: dir },
      );
      invariant(
        trimmedRes.exitCode === 0,
        `trimming failed: ${trimmedRes.stdout} ${trimmedRes.stderr}`,
      );
      mediaPath = out;
    }
  }

  return {
    mediaPath,
    thumbnailPath,
  };
}
