import { basename, join } from 'node:path';
import { unlink, stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import PQueue from 'p-queue';
import chokidar from 'chokidar';
import fastGlob from 'fast-glob';
import { throttle } from 'lodash-es';
import rimraf from 'rimraf';
import mime from 'mime';
import invariant from 'tiny-invariant';
import {
  getVariants,
  runFfmpegEncode,
  variantsToMasterVideoPlaylist,
} from '../../../util/ffmpeg';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import { updateUploadRecord } from '../..';
import { runAudiowaveform } from '../../../util/audiowaveform';
import type { Probe } from './probe';

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
  const throttledUpdateUploadRecord = throttle(updateUploadRecord, 2500);

  await updateUploadRecord(uploadRecordId, {
    transcodingStartedAt: new Date(),
  });

  try {
    await mkdirp(dir);
    const downloadPath = join(dir, 'download');

    console.log(`Downloading file to ${downloadPath}`);

    await streamObjectToFile(
      'INGEST',
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

          await retryablePutFile({
            to: 'PUBLIC',
            key: `${uploadRecordId}/${fileName}`,
            contentType: 'video/mp2ts',
            contentLength: (await stat(path)).size,
            path,
          });

          console.log(`Done uploading media segment: ${path}`);
          console.log(`Deleting ${path}`);

          await unlink(path);

          console.log(`Deleted ${path}`);
          Context.current().heartbeat(`Uploading done: ${path}`);
        },
        {
          signal: cancellationSignal,
        },
      );
    });

    const encodeProc = runFfmpegEncode(
      dir,
      downloadPath,
      variants,
      cancellationSignal,
    );
    encodeProc.stdout?.on('data', (data) => {
      dataHeartbeat();

      const match = String(data).match(/frame=(\d+)/);

      if (!match) {
        return;
      }

      const frames = parseInt(match[1] ?? '');
      const totalFrames = parseInt(
        String(probe.streams.find((s) => s.nb_frames)?.nb_frames) ?? '',
      );

      if (!isNaN(frames) && !isNaN(totalFrames)) {
        const progress = frames / totalFrames;
        throttledUpdateUploadRecord(uploadRecordId, {
          transcodingProgress: progress,
        });
      }
    });
    encodeProc.stderr?.on('data', dataHeartbeat);
    const encodeProcRes = await encodeProc;
    throttledUpdateUploadRecord.cancel();
    await updateUploadRecord(uploadRecordId, { transcodingProgress: 1 });

    const downloadableFiles = await fastGlob(join(dir, '*.{mp4,m4a}'));

    // Upload downloadable files
    uploadQueue.addAll(
      downloadableFiles.map((path) => async () => {
        const filename = basename(path);
        const contentType = mime.getType(filename);
        invariant(contentType !== null, 'Mime type should not be null');
        Context.current().heartbeat(`Uploading downloadable file`);
        console.log(`Uploading downloadable file: ${filename}`);
        await retryablePutFile({
          to: 'PUBLIC',
          key: `${uploadRecordId}/${filename}`,
          contentType,
          path,
          contentLength: (await stat(path)).size,
        });
        Context.current().heartbeat(`Uploaded downloadable file: ${filename}`);
        console.log(`Uploaded downloadable file: ${filename}`);
      }),
      {
        signal: cancellationSignal,
      },
    );

    const playlists = await fastGlob(join(dir, '*.m3u8'));

    // Upload playlist files
    uploadQueue.addAll(
      playlists.map((path) => async () => {
        const filename = basename(path);
        Context.current().heartbeat(`Uploading playlist file`);
        console.log(`Uploading playlist file: ${filename}`);
        await retryablePutFile({
          to: 'PUBLIC',
          key: `${uploadRecordId}/${filename}`,
          contentType: 'application/x-mpegURL',
          path,
          contentLength: (await stat(path)).size,
        });
        Context.current().heartbeat(`Uploaded playlist file: ${filename}`);
        console.log(`Uploaded playlist file: ${filename}`);
      }),
      {
        signal: cancellationSignal,
      },
    );

    // Upload master playlist if there is more than just audio
    if (
      variants.filter((v) => v !== 'AUDIO' && !v.endsWith('_DOWNLOAD')).length >
      0
    ) {
      uploadQueue.add(
        async () => {
          console.log('Uploading master playlist file');
          Context.current().heartbeat(`Uploading playlist file`);
          const playlistBuffer = Buffer.from(
            variantsToMasterVideoPlaylist(variants),
          );
          await retryablePutFile({
            to: 'PUBLIC',
            key: `${uploadRecordId}/master.m3u8`,
            contentType: 'application/x-mpegURL',
            body: playlistBuffer,
          });
          Context.current().heartbeat('Uploaded master playlist file');
          console.log('Uploaded master playlist file');
        },
        {
          signal: cancellationSignal,
        },
      );
    } else {
      console.log(
        `Not creating master playlist given the variants: ${formatter.format(
          variants,
        )}`,
      );
    }

    // Generate and upload peaks
    const peakFiles = await runAudiowaveform(
      dir,
      downloadPath,
      cancellationSignal,
    );
    uploadQueue.addAll([
      async () => {
        console.log('Uploading peak json');
        Context.current().heartbeat(`Uploading peak json`);
        await retryablePutFile({
          to: 'PUBLIC',
          key: `${uploadRecordId}/peaks.json`,
          contentType: 'application/json',
          path: peakFiles.json,
          contentLength: (await stat(peakFiles.json)).size,
        });
        Context.current().heartbeat('Uploaded peak json');
        console.log('Uploaded peak json');
      },
      async () => {
        console.log('Uploading peak dat');
        Context.current().heartbeat(`Uploading peak dat`);
        await retryablePutFile({
          to: 'PUBLIC',
          key: `${uploadRecordId}/peaks.dat`,
          contentType: 'application/octet-stream',
          path: peakFiles.dat,
          contentLength: (await stat(peakFiles.dat)).size,
        });
        Context.current().heartbeat('Uploaded peak dat');
        console.log('Uploaded peak dat');
      },
    ]);

    // Upload logs
    uploadQueue.add(
      async () => {
        Context.current().heartbeat('Uploading stdout');
        await retryablePutFile({
          to: 'INGEST',
          key: `${uploadRecordId}/stdout.txt`,
          contentType: 'text/plain',
          body: Buffer.from(encodeProcRes.stdout),
        });
        Context.current().heartbeat('Uploaded stdout');
      },
      {
        signal: cancellationSignal,
      },
    );

    await uploadQueue.onIdle();
    await watcher.close();
    await updateUploadRecord(uploadRecordId, {
      variants,
      transcodingFinishedAt: new Date(),
    });
  } catch (e) {
    await updateUploadRecord(uploadRecordId, {
      transcodingStartedAt: null,
      transcodingFinishedAt: null,
    });
  } finally {
    dataHeartbeat.flush();
    await rimraf(dir);
  }
}
