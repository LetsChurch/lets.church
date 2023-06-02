import { basename, join } from 'node:path';
import { unlink, stat } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import fastGlob from 'fast-glob';
import { throttle } from 'lodash-es';
import rimraf from 'rimraf';
import mime from 'mime';
import invariant from 'tiny-invariant';
import type { UploadVariant } from '@prisma/client';
import {
  getVariants,
  runFfmpegEncode,
  variantsToMasterVideoPlaylist,
} from '../../../util/ffmpeg';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import { recordDownloadSize, updateUploadRecord } from '../..';
import { runAudiowaveform } from '../../../util/audiowaveform';
import type { Probe } from './probe';

const WORK_DIR =
  process.env['TRANSCODE_WORKING_DIRECTORY'] ?? '/data/transcode';

const formatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

async function uploadSegments(id: string, dir: string) {
  const segmentFiles = await fastGlob(join(dir, '*.ts'));

  for (const path of segmentFiles) {
    Context.current().heartbeat(`Starting uplaod: ${path}`);
    console.log(`Uploading media segment: ${path}`);

    await retryablePutFile({
      to: 'PUBLIC',
      key: `${id}/${basename(path)}`,
      contentType: 'video/mp2ts',
      contentLength: (await stat(path)).size,
      path,
    });

    console.log(`Done uploading media segment: ${path}`);
    console.log(`Deleting ${path}`);

    await unlink(path);

    console.log(`Deleted ${path}`);
    Context.current().heartbeat(`Uploading done: ${path}`);
  }
}

export default async function transcode(
  uploadRecordId: string,
  s3UploadKey: string,
  probe: Probe,
) {
  Context.current().heartbeat('job start');
  const cancellationSignal = Context.current().cancellationSignal;
  const dir = join(WORK_DIR, uploadRecordId);
  const dataHeartbeat = throttle(() => Context.current().heartbeat(), 5000);
  const throttledUpdateUploadRecord = throttle(updateUploadRecord, 2500);

  await updateUploadRecord(uploadRecordId, {
    transcodingStartedAt: new Date(),
  });

  try {
    console.log(`Making work directory: ${dir}`);

    await mkdirp(dir);
    const downloadPath = join(dir, 'download');

    console.log(`Downloading file to ${downloadPath}`);

    await streamObjectToFile(
      'INGEST',
      s3UploadKey,
      downloadPath,
      dataHeartbeat,
    );

    console.log(`Downloaded file to ${downloadPath}`);

    Context.current().heartbeat('file downloaded');

    const { width, height } = probe.streams.find(
      (s): s is Extract<typeof s, { codec_type: 'video' }> =>
        s.codec_type === 'video',
    ) ?? { width: 0, height: 0 };

    console.log(
      `Found ${probe.streams.length} streams. (width: ${width}, height: ${height})`,
    );

    const variants = getVariants(
      width,
      height,
      probe.format.format_name
        .split(',')
        .every((f) => mime.getType(f)?.startsWith('audio/')),
    );

    console.log(
      `Will encode ${variants.length} variants: ${formatter.format(variants)}`,
    );

    console.log('Running ffmpeg');

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
        // TODO: get progress when nb_frames is undefined
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

    while (encodeProc.exitCode === null) {
      await uploadSegments(uploadRecordId, dir);
      await setTimeout(1000);
    }

    await uploadSegments(uploadRecordId, dir);

    const encodeProcRes = await encodeProc;

    console.log(`ffmpeg finished with code ${encodeProcRes.exitCode}`);

    console.log('Cancelling remaining upload record updates');

    throttledUpdateUploadRecord.cancel();

    console.log('Marking transcoding progress as done');
    await updateUploadRecord(uploadRecordId, { transcodingProgress: 1 });

    console.log('Finding downloadable files');

    const downloadableFiles = await fastGlob(join(dir, '*.{mp4,m4a}'));

    console.log(
      `Found downloadable files:\n - ${downloadableFiles.join('\n -')}`,
    );

    // Upload downloadable files
    console.log(`Uploading ${downloadableFiles.length} downloadable files`);
    for (const path of downloadableFiles) {
      const filename = basename(path);
      const contentType = mime.getType(filename);
      invariant(contentType !== null, 'Mime type should not be null');
      Context.current().heartbeat(`Uploading downloadable file`);
      console.log(`Uploading downloadable file: ${filename}`);
      const byteSize = (await stat(path)).size;
      await retryablePutFile({
        to: 'PUBLIC',
        key: `${uploadRecordId}/${filename}`,
        contentType,
        path,
        contentLength: byteSize,
      });
      Context.current().heartbeat(`Uploaded downloadable file: ${filename}`);
      console.log(`Uploaded downloadable file: ${filename}`);
      console.log('Recording download size');
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore: TODO: type safety
      const variant: UploadVariant = filename.split('.')[0];
      invariant(variant, 'variant should be defined');
      await recordDownloadSize(uploadRecordId, variant, byteSize);
    }

    console.log('Finding playlist files');

    const playlists = await fastGlob(join(dir, '*.m3u8'));

    console.log(`Found playlist files:\n - ${playlists.join('\n -')}`);
    console.log(`Uploading ${playlists.length} playlist files`);

    // Upload playlist files
    for (const path of playlists) {
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
    }

    // Upload master playlist if there is more than just audio
    if (variants.some((v) => v.startsWith('VIDEO'))) {
      console.log(
        `Uploading master playlist file given the variants: ${formatter.format(
          variants,
        )}`,
      );
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
    } else {
      console.log(
        `Not creating master playlist given the variants: ${formatter.format(
          variants,
        )}`,
      );
    }

    // Generate and upload peaks
    console.log('Generating peaks');
    const peakFiles = await runAudiowaveform(
      dir,
      downloadPath,
      cancellationSignal,
      dataHeartbeat,
    );

    console.log('Queuing upload of peaks');
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

    // Upload logs
    console.log('Queing upload of logs');
    Context.current().heartbeat('Uploading stdout');
    await retryablePutFile({
      to: 'INGEST',
      key: `${uploadRecordId}/stdout.txt`,
      contentType: 'text/plain',
      body: Buffer.from(encodeProcRes.stdout),
    });
    Context.current().heartbeat('Uploaded stdout');
    console.log('Queueing final update for upload record');
    await updateUploadRecord(uploadRecordId, {
      variants,
      transcodingFinishedAt: new Date(),
    });
  } catch (e) {
    console.log('Error!');
    console.log(e);
    await updateUploadRecord(uploadRecordId, {
      transcodingStartedAt: null,
      transcodingFinishedAt: null,
    });
  } finally {
    console.log('Flushing heartbeats');
    dataHeartbeat.flush();
    console.log(`Removing work directory: ${dir}`);
    await rimraf(dir);
  }
}
