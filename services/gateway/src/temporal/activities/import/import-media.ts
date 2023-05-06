import { createWriteStream } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execa } from 'execa';
import rimraf from 'rimraf';
import * as Z from 'zod';
import { v4 as uuid } from 'uuid';
import mime from 'mime';
import fastGlob from 'fast-glob';
import invariant from 'tiny-invariant';
import mkdirp from 'mkdirp';
import { noop, throttle } from 'lodash-es';
import { Context } from '@temporalio/activity';
import { putFile } from '../../../util/s3';

const WORK_DIR = '/data/import';

const stdoutThumbnailSchema = Z.object({
  thumbnail: Z.string().url(),
}).passthrough();

async function downloadUrl(url: string, dir: string, heartbeat = noop) {
  console.log(`Downloading URL ${url}`);
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

  console.log(`Downloaded ${url} to ${dest}`);

  return dest;
}

async function ytdlp(url: string, dir: string, heartbeat = noop) {
  console.log(`Running yt-dlp for URL ${url}`);
  const mainYtdlp = execa(
    'yt-dlp',
    [url, '-o', `download.%(ext)s`, '--no-overwrites'],
    {
      cwd: dir,
    },
  );
  mainYtdlp.stdout?.on('data', () => heartbeat(`yt-dlp stdout ${url}`));
  mainYtdlp.stderr?.on('data', () => heartbeat(`yt-dlp stdout ${url}`));
  const [, thumbnailRes] = await Promise.all([
    mainYtdlp,
    execa('yt-dlp', [url, '--print', '%()j']),
  ]);

  const mediaPaths = await fastGlob(`${dir}/download.*`);
  invariant(
    mediaPaths.length === 1,
    'Multiple downloads or no downloadds found!',
  );

  const mediaPath = mediaPaths.at(0);
  invariant(mediaPath, 'No media path found!');

  console.log(`yt-dlp downloaded ${url} to ${mediaPath}`);

  const parsed = stdoutThumbnailSchema.safeParse(
    JSON.parse(thumbnailRes.stdout),
  );

  const thumbnailPath = parsed.success
    ? await downloadUrl(parsed.data.thumbnail, dir, heartbeat)
    : null;

  return { mediaPath, thumbnailPath };
}

export default async function importMedia(uploadRecordId: string, url: string) {
  const throttledHeartbeat = throttle(
    (arg: string) => Context.current().heartbeat(arg),
    5000,
  );

  const dir = join(WORK_DIR, uploadRecordId);
  await mkdirp(dir);

  let mediaUploadKey: string;
  let thumbnailUploadKey: string | null = null;

  try {
    let mediaPath: string;
    let thumbnailPath: string | null = null;

    if (/\.(mp3|m4a|mp4)$/.test(url)) {
      mediaPath = await downloadUrl(url, dir, throttledHeartbeat);
    } else {
      const res = await ytdlp(url, dir, throttledHeartbeat);
      {
      }
      mediaPath = res.mediaPath;
      thumbnailPath = res.thumbnailPath;
    }

    mediaUploadKey = `${uploadRecordId}/${uuid()}`;

    await putFile({
      key: mediaUploadKey,
      contentType:
        mime.getType(extname(mediaPath)) ?? 'application/octet-stream',
      path: mediaPath,
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
  } catch (e) {
    throttledHeartbeat.flush();
    throw e;
  } finally {
    await rimraf(dir);
  }

  return { mediaUploadKey, thumbnailUploadKey };
}
