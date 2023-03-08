import { basename, join } from 'node:path';
import { createReadStream } from 'node:fs';
import { unlink, stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import PQueue from 'p-queue';
import chokidar from 'chokidar';
import fastGlob from 'fast-glob';
import { throttle } from 'lodash-es';
import rimraf from 'rimraf';
import type { Probe } from './probe';
import {
  getVariants,
  runFfmpegEncode,
  variantsToMasterVideoPlaylist,
} from '../../../util/ffmpeg';
import {
  retryablePutFile,
  S3_INGEST_BUCKET,
  S3_PUBLIC_BUCKET,
  streamObjectToFile,
} from '../../../util/s3';
import prisma from '../../../util/prisma';

const WORK_DIR = '/data/transcode';

const formatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

export default async function transcode(
  uploadRecordId: string,
  s3UploadKey: string,
  probe: Probe,
) {
  Context.current().heartbeat('job start');
  const cancellationSignal = Context.current().cancellationSignal;
  const dir = join(WORK_DIR, uploadRecordId);
  const uploadQueue = new PQueue({ concurrency: 1 });
  const dataHeartbeat = throttle(() => Context.current().heartbeat(), 5000);

  try {
    await mkdirp(dir);
    const downloadPath = join(dir, 'download');
    await streamObjectToFile(
      S3_INGEST_BUCKET,
      s3UploadKey,
      downloadPath,
      dataHeartbeat,
    );

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

    // Watch for new video segments and upload them
    const watcher = chokidar.watch(join(dir, '*.ts')).on('add', (path) => {
      console.log(`New media segment: ${path}`);

      const fileName = basename(path);

      uploadQueue.add(
        async () => {
          Context.current().heartbeat(`Starting uplaod: ${path}`);
          console.log(`Uploading media segment: ${path}`);

          await retryablePutFile(
            S3_PUBLIC_BUCKET,
            `${uploadRecordId}/${fileName}`,
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
        },
        {
          signal: cancellationSignal as AbortSignal, // TODO: temporal is using a non-standard AbortSignal
        },
      );
    });

    const encodeProc = runFfmpegEncode(
      dir,
      downloadPath,
      variants,
      cancellationSignal as AbortSignal, // TODO: temporal is using a non-standard AbortSignal
    );
    encodeProc.stdout?.on('data', dataHeartbeat);
    encodeProc.stderr?.on('data', dataHeartbeat);
    const encodeProcRes = await encodeProc;

    const playlists = await fastGlob(join(dir, '*.m3u8'));

    // Upload playlist files
    uploadQueue.addAll(
      playlists.map((playlist) => async () => {
        const filename = basename(playlist);
        Context.current().heartbeat(`Uploading playlist file`);
        console.log(`Uploading playlist file: ${filename}`);
        await retryablePutFile(
          S3_PUBLIC_BUCKET,
          `${uploadRecordId}/${filename}`,
          'application/x-mpegURL',
          createReadStream(playlist),
          {
            contentLength: (await stat(playlist)).size,
          },
        );
        Context.current().heartbeat(`Uploaded playlist file: ${filename}`);
        console.log(`Uploaded playlist file: ${filename}`);
      }),
      {
        signal: cancellationSignal as AbortSignal, // TODO: temporal is using a non-standard AbortSignal
      },
    );

    // Upload master playlist if there is more than just audio
    if (variants.filter((v) => v !== 'AUDIO').length > 0) {
      uploadQueue.add(
        async () => {
          console.log('Uploading master playlist file');
          Context.current().heartbeat(`Uploading playlist file`);
          const playlistBuffer = Buffer.from(
            variantsToMasterVideoPlaylist(variants),
          );
          await retryablePutFile(
            S3_PUBLIC_BUCKET,
            `${uploadRecordId}/master.m3u8`,
            'application/x-mpegURL',
            playlistBuffer,
          );
          Context.current().heartbeat('Uploaded master playlist file');
          console.log('Uploaded master playlist file');
        },
        {
          signal: cancellationSignal as AbortSignal, // TODO: temporal is using a non-standard AbortSignal
        },
      );
    } else {
      console.log(
        `Not creating master playlist given the variants: ${variants.join(
          ' ',
        )}`,
      );
    }

    // Upload logs
    uploadQueue.add(
      async () => {
        Context.current().heartbeat('Uploading stdout');
        await retryablePutFile(
          S3_PUBLIC_BUCKET,
          `${uploadRecordId}/stdout.txt`,
          'text/plain',
          Buffer.from(encodeProcRes.stdout),
        );
        Context.current().heartbeat('Uploaded stdout');
      },
      {
        signal: cancellationSignal as AbortSignal, // TODO: temporal is using a non-standard AbortSignal
      },
    );

    await uploadQueue.onEmpty();
    await watcher.close();
    await prisma.uploadRecord.update({
      where: { id: uploadRecordId },
      data: {
        variants,
      },
    });
  } finally {
    dataHeartbeat.flush();
    await rimraf(dir);
  }
}
