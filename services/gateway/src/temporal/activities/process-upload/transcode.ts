import { basename, join } from 'node:path';
import { createReadStream } from 'node:fs';
import { unlink, stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import PQueue from 'p-queue';
import chokidar from 'chokidar';
import fastGlob from 'fast-glob';
import type { Probe } from './probe';
import {
  getVariants,
  MediaVariant,
  runFfmpegEncode,
  variantsToMasterVideoPlaylist,
} from '../../../util/ffmpeg';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import rimraf from '../../../util/rimraf';

const WORK_DIR = '/data/transcode';

const formatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

export default async function transcode(id: string, probe: Probe) {
  Context.current().heartbeat('job start');
  const dir = join(WORK_DIR, id);

  try {
    await mkdirp(dir);
    const downloadPath = join(dir, id);
    await streamObjectToFile(id, downloadPath);

    Context.current().heartbeat('file downloaded');

    const { width, height } = probe.streams.find(
      (s): s is Extract<typeof s, { codec_type: 'video' }> =>
        s.codec_type === 'video',
    ) ?? { width: 0, height: 0 };

    console.log(
      `Found ${probe.streams.length} streams. (width: ${width}, height: ${height})`,
    );

    const variants = getVariants(width, height);

    console.log(
      `Will encode ${variants.length} variants: ${formatter.format(variants)}`,
    );

    const uploadQueue = new PQueue({ concurrency: 1 });

    // Watch for new video segments and upload them
    const watcher = chokidar.watch(join(dir, '*.ts')).on('add', (path) => {
      console.log(`New media segment: ${path}`);

      const fileName = basename(path);

      uploadQueue.add(async () => {
        Context.current().heartbeat(`Starting uplaod: ${path}`);
        console.log(`Uploading media segment: ${path}`);

        await retryablePutFile(
          `${id}/${fileName}`,
          'video/mp2ts',
          createReadStream(path),
          {
            contentLength: (await stat(path)).size,
          },
        );

        console.log(`Done uploading media segment: ${path}`);
        console.log(`Deleting ${path}`);

        await unlink(path);

        console.log(`Deleted ${path}`);
        Context.current().heartbeat(`Uploading done: ${path}`);
      });
    });

    const encodeProc = await runFfmpegEncode(dir, downloadPath, variants);
    const playlists = await fastGlob(join(dir, '*.m3u8'));

    // Upload playlist files
    uploadQueue.addAll(
      playlists.map((playlist) => async () => {
        const filename = basename(playlist);
        Context.current().heartbeat(`Uploading playlist file`);
        console.log(`Uploading playlist file: ${filename}`);
        await retryablePutFile(
          `${id}/${filename}`,
          'application/x-mpegURL',
          createReadStream(playlist),
          {
            contentLength: (await stat(playlist)).size,
          },
        );
        Context.current().heartbeat(`Uploaded playlist file: ${filename}`);
        console.log(`Uploaded playlist file: ${filename}`);
      }),
    );

    // Upload master playlist if there is more than just audio
    if (variants.filter((v) => v !== MediaVariant.AUDIO).length > 0) {
      uploadQueue.add(async () => {
        console.log('Uploading master playlist file');
        Context.current().heartbeat(`Uploading playlist file`);
        const playlistBuffer = Buffer.from(
          variantsToMasterVideoPlaylist(variants),
        );
        await retryablePutFile(
          `${id}/master.m3u8`,
          'application/x-mpegURL',
          playlistBuffer,
        );
        Context.current().heartbeat('Uploaded master playlist file');
        console.log('Uploaded master playlist file');
      });
    } else {
      console.log(
        `Not creating master playlist given the variants: ${variants.join(
          ' ',
        )}`,
      );
    }

    // Upload logs
    uploadQueue.add(async () => {
      Context.current().heartbeat('Uploading stdout');
      await retryablePutFile(
        `${id}/stdout.txt`,
        'text/plain',
        Buffer.from(encodeProc.stdout),
      );
      Context.current().heartbeat('Uploaded stdout');
    });

    await uploadQueue.onEmpty();
    await watcher.close();
  } finally {
    await rimraf(dir);
  }
}
