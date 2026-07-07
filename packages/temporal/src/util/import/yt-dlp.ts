import type { Logger } from '@letschurch/util';
import { invariant, noop } from 'es-toolkit';
import { execa } from 'execa';
import fastGlob from 'fast-glob';
import * as z from 'zod';

import { downloadUrl } from './download';
import { assertPublicUrl } from './safe-url';

const baseYtDlpArgs = [
  '--extractor-args',
  'generic:impersonate=chrome',
  '--sleep-requests',
  '2',
  '--sleep-interval',
  '10',
  '--max-sleep-interval',
  '60',
];

const stdoutThumbnailSchema = z.looseObject({
  thumbnail: z.url(),
});

export async function ytdlp(
  input: string | URL,
  dir: string,
  log: Logger,
  heartbeat: (s: string) => unknown = noop,
) {
  // Block obviously-internal targets before handing the URL to the yt-dlp
  // subprocess (which does its own fetching/redirect-following).
  const url = await assertPublicUrl(input);

  log.info(`Running yt-dlp for URL ${url}`);
  const mainYtdlp = execa(
    'yt-dlp',
    [
      url.toString(),
      '-o',
      `download.%(ext)s`,
      '--no-overwrites',
      ...baseYtDlpArgs,
    ],
    {
      cwd: dir,
    },
  );
  mainYtdlp.stdout?.on('data', () => heartbeat(`yt-dlp stdout ${url}`));
  mainYtdlp.stderr?.on('data', () => heartbeat(`yt-dlp stderr ${url}`));
  const [, thumbnailRes] = await Promise.all([
    mainYtdlp,
    execa('yt-dlp', [url.toString(), '--print', '%()j', ...baseYtDlpArgs]),
  ]);

  const mediaPaths = await fastGlob(`${dir}/download.*`);
  invariant(
    mediaPaths.length === 1,
    'Multiple downloads or no downloads found!',
  );

  const mediaPath = mediaPaths.at(0);
  invariant(mediaPath, 'No media path found!');

  log.info(`yt-dlp downloaded ${url} to ${mediaPath}`);

  const parsed = stdoutThumbnailSchema.safeParse(
    JSON.parse(thumbnailRes.stdout),
  );

  let thumbnailPath: string | null = null;

  try {
    thumbnailPath = parsed.success
      ? await downloadUrl(parsed.data.thumbnail, dir, log, heartbeat)
      : null;
  } catch (e) {
    log.error(`Error downloading thumbnail: ${e}`);
  }

  return { mediaPath, thumbnailPath };
}
