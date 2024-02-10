import { createWriteStream } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execa } from 'execa';
import rimraf from 'rimraf';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import mime from 'mime';
import fastGlob from 'fast-glob';
import invariant from 'tiny-invariant';
import mkdirp from 'mkdirp';
import { noop } from 'lodash-es';
import { Context } from '@temporalio/activity';
import type { Prisma } from '@prisma/client';
import { putFile, putFileMultipart } from '../../../util/s3';
import { createUploadRecord, updateUploadRecord } from '../..';
import logger from '../../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/import/import-media',
});

const WORK_DIR = process.env['IMPORT_WORKING_DIRECTORY'] ?? '/data/import';

const stdoutThumbnailSchema = z
  .object({
    thumbnail: z.string().url(),
  })
  .passthrough();

async function downloadUrl(
  url: string,
  dir: string,
  log: typeof logger,
  heartbeat = noop,
) {
  log.info(`Downloading URL ${url}`);
  const res = await fetch(url);

  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  // Write fetch result to file
  const dest = join(dir, basename(url));
  const stream = createWriteStream(dest);

  await pipeline(
    res.body,
    (chunk) => {
      heartbeat(`chunk from ${url}`);
      return chunk;
    },
    stream,
  );

  log.info(`Downloaded ${url} to ${dest}`);

  return dest;
}

const baseYtDlpArgs = [
  '--sleep-requests',
  '2',
  '--sleep-interval',
  '10',
  '--max-sleep-interval',
  '60',
];

async function ytdlp(
  url: string,
  dir: string,
  log: typeof logger,
  heartbeat = noop,
) {
  log.info(`Running yt-dlp for URL ${url}`);
  const mainYtdlp = execa(
    'yt-dlp',
    [url, '-o', `download.%(ext)s`, '--no-overwrites', ...baseYtDlpArgs],
    {
      cwd: dir,
    },
  );
  mainYtdlp.stdout?.on('data', () => heartbeat(`yt-dlp stdout ${url}`));
  mainYtdlp.stderr?.on('data', () => heartbeat(`yt-dlp stderr ${url}`));
  const [, thumbnailRes] = await Promise.all([
    mainYtdlp,
    execa('yt-dlp', [url, '--print', '%()j', ...baseYtDlpArgs]),
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

export default async function importMedia(
  url: string,
  {
    trimSilence = false,
    ...data
  }: Prisma.UploadRecordCreateArgs['data'] & { trimSilence?: boolean },
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'importMedia',
    args: {
      url,
      channelSlug: data.channel?.connect?.slug,
    },
    meta: JSON.stringify({ data }),
  });

  const heartbeat = (arg: string) => Context.current().heartbeat(arg);

  let uploadRecordId: string;
  const dir = join(WORK_DIR, uuid());
  await mkdirp(dir);

  let mediaUploadKey: string;
  let thumbnailUploadKey: string | null = null;

  try {
    let mediaPath: string;
    let thumbnailPath: string | null = null;

    if (/\.(mp3|m4a|mp4)$/.test(url)) {
      mediaPath = await downloadUrl(url, dir, activityLogger, heartbeat);
    } else {
      const res = await ytdlp(url, dir, activityLogger, heartbeat);
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
        const firstEnd = matches
          .find((m) => m.groups?.['com'] === 'end')
          ?.at(-1);
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

    uploadRecordId = await createUploadRecord(
      data,
      Context.current().info.workflowExecution.workflowId,
    );
    mediaUploadKey = `${uploadRecordId}/${uuid()}`;

    await putFileMultipart({
      key: mediaUploadKey,
      contentType:
        mime.getType(extname(mediaPath)) ?? 'application/octet-stream',
      path: mediaPath,
      onProgress: (progress) =>
        heartbeat(`uploading ${Math.round(progress * 1000) / 10}%`),
    });

    if (thumbnailPath) {
      thumbnailUploadKey = `${uploadRecordId}/${uuid()}`;

      await putFile({
        key: thumbnailUploadKey,
        contentType:
          mime.getType(extname(thumbnailPath)) ?? 'application/octet-stream',
        path: thumbnailPath,
      });
    }

    await updateUploadRecord(uploadRecordId, {
      finalizedUploadKey: mediaUploadKey,
      uploadFinalizedAt: new Date(),
    });
  } catch (e) {
    activityLogger.error(e instanceof Error ? e.message : e);
    throw e;
  } finally {
    await rimraf(dir);
  }

  return { uploadRecordId, mediaUploadKey, thumbnailUploadKey };
}
