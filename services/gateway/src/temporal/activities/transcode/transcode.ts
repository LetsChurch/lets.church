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
  HwAccel,
  getVariants,
  runFfmpegEncode,
  variantsToMasterVideoPlaylist,
} from '../../../util/ffmpeg';
import {
  putFileMultipart,
  retryablePutFile,
  streamObjectToFile,
} from '../../../util/s3';
import { recordDownloadSize, updateUploadRecord } from '../..';
import { runAudiowaveform } from '../../../util/audiowaveform';
import type { Probe } from '../../../util/zod';
import logger from '../../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcode/transcode',
});

const hwAccelEnv = process.env['TRANSCODE_HW_ACCEL'];
const HW_ACCEL: HwAccel = hwAccelEnv?.startsWith('ama')
  ? (hwAccelEnv as HwAccel)
  : 'none';

const WORK_DIR =
  process.env['TRANSCODE_WORKING_DIRECTORY'] ?? '/data/transcode';

const formatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

async function uploadSegments(id: string, dir: string, log: typeof logger) {
  const segmentFiles = await fastGlob(join(dir, '*.ts'));
  const signal = Context.current().cancellationSignal;

  for (const path of segmentFiles) {
    Context.current().heartbeat(`Starting upload: ${path}`);
    log.info(`Uploading media segment: ${path}`);

    await retryablePutFile({
      to: 'PUBLIC',
      key: `${id}/${basename(path)}`,
      contentType: 'video/mp2ts',
      contentLength: (await stat(path)).size,
      path,
      signal,
    });

    log.info(`Done uploading media segment: ${path}`);
    log.info(`Deleting ${path}`);

    await unlink(path);

    log.info(`Deleted ${path}`);
    Context.current().heartbeat(`Uploading done: ${path}`);
  }
}

export default async function transcode(
  uploadRecordId: string,
  s3UploadKey: string,
  probe: Probe,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'transcode',
    args: {
      s3UploadKey,
    },
  });

  Context.current().heartbeat('job start');
  const cancellationSignal = Context.current().cancellationSignal;
  const workingDir = join(WORK_DIR, uploadRecordId);
  const throttledUpdateUploadRecord = throttle(updateUploadRecord, 2500);

  await updateUploadRecord(uploadRecordId, {
    transcodingStartedAt: new Date(),
  });

  const stdout: Array<string> = [];
  const stderr: Array<string> = [];

  try {
    activityLogger.info(`Making work directory: ${workingDir}`);

    await mkdirp(workingDir);
    const downloadPath = join(workingDir, 'download');
    await streamObjectToFile('INGEST', s3UploadKey, downloadPath, () =>
      Context.current().heartbeat('download'),
    );
    const { width, height } = probe.streams.find(
      (s): s is Extract<typeof s, { codec_type: 'video' }> =>
        s.codec_type === 'video',
    ) ?? { width: 0, height: 0 };

    activityLogger.info(
      `Found ${probe.streams.length} streams. (width: ${width}, height: ${height})`,
    );

    const variants = getVariants(probe);

    activityLogger.info(
      `Will encode ${variants.length} variants: ${formatter.format(variants)}`,
    );

    activityLogger.info('Running ffmpeg');

    const encodeProc = runFfmpegEncode({
      cwd: workingDir,
      inputFilename: downloadPath,
      probe,
      variants,
      signal: cancellationSignal,
      hwAccel: HW_ACCEL,
    });

    encodeProc.stdout?.on('data', (data) => {
      const str = String(data);
      stdout.push(str);

      const match = str.match(/frame=(\d+)/);

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

    encodeProc.stderr?.on('data', (data) => stderr.push(String(data)));

    while (encodeProc.exitCode === null) {
      Context.current().heartbeat('waiting for ffmpeg');
      await uploadSegments(uploadRecordId, workingDir, activityLogger);
      await setTimeout(1000);
    }

    await uploadSegments(uploadRecordId, workingDir, activityLogger);

    const encodeProcRes = await encodeProc;

    activityLogger.info(`ffmpeg finished with code ${encodeProcRes.exitCode}`);

    activityLogger.info('Cancelling remaining upload record updates');

    throttledUpdateUploadRecord.cancel();

    activityLogger.info('Marking transcoding progress as done');
    await updateUploadRecord(uploadRecordId, { transcodingProgress: 1 });

    activityLogger.info('Finding downloadable files');

    const downloadableFiles = await fastGlob(join(workingDir, '*.{mp4,m4a}'));

    activityLogger.info(
      `Found downloadable files:\n - ${downloadableFiles.join('\n -')}`,
    );

    // Upload downloadable files
    activityLogger.info(
      `Uploading ${downloadableFiles.length} downloadable files`,
    );

    for (const path of downloadableFiles) {
      const filename = basename(path);
      const contentType = mime.getType(filename);
      invariant(contentType !== null, 'Mime type should not be null');
      Context.current().heartbeat(`Uploading downloadable file`);
      activityLogger.info(`Uploading downloadable file: ${filename}`);
      const byteSize = (await stat(path)).size;
      await putFileMultipart({
        to: 'PUBLIC',
        key: `${uploadRecordId}/${filename}`,
        contentType,
        path,
        onProgress: (progress) =>
          Context.current().heartbeat(
            `upload ${Math.round(progress * 1000) / 10}%`,
          ),
        signal: cancellationSignal,
      });
      Context.current().heartbeat(`Uploaded downloadable file: ${filename}`);
      activityLogger.info(`Uploaded downloadable file: ${filename}`);
      activityLogger.info('Recording download size');
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore: TODO: type safety
      const variant: UploadVariant = filename.split('.')[0];
      invariant(variant, 'variant should be defined');
      await recordDownloadSize(uploadRecordId, variant, byteSize);
    }

    activityLogger.info('Finding playlist files');

    const playlists = await fastGlob(join(workingDir, '*.m3u8'));

    activityLogger.info(`Found playlist files:\n - ${playlists.join('\n -')}`);
    activityLogger.info(`Uploading ${playlists.length} playlist files`);

    // Upload playlist files
    for (const path of playlists) {
      const filename = basename(path);
      Context.current().heartbeat(`Uploading playlist file`);
      activityLogger.info(`Uploading playlist file: ${filename}`);
      await retryablePutFile({
        to: 'PUBLIC',
        key: `${uploadRecordId}/${filename}`,
        contentType: 'application/x-mpegURL',
        path,
        contentLength: (await stat(path)).size,
        signal: cancellationSignal,
      });
      Context.current().heartbeat(`Uploaded playlist file: ${filename}`);
      activityLogger.info(`Uploaded playlist file: ${filename}`);
    }

    // Upload master playlist if there is more than just audio
    if (variants.some((v) => v.startsWith('VIDEO'))) {
      activityLogger.info(
        `Uploading master playlist file given the variants: ${formatter.format(
          variants,
        )}`,
      );
      activityLogger.info('Uploading master playlist file');
      Context.current().heartbeat(`Uploading playlist file`);
      const playlistBuffer = Buffer.from(
        variantsToMasterVideoPlaylist(variants),
      );
      await retryablePutFile({
        to: 'PUBLIC',
        key: `${uploadRecordId}/master.m3u8`,
        contentType: 'application/x-mpegURL',
        body: playlistBuffer,
        signal: cancellationSignal,
      });
      Context.current().heartbeat('Uploaded master playlist file');
      activityLogger.info('Uploaded master playlist file');
    } else {
      activityLogger.info(
        `Not creating master playlist given the variants: ${formatter.format(
          variants,
        )}`,
      );
    }

    // Generate and upload peaks
    activityLogger.info('Generating peaks');
    const peakFiles = await runAudiowaveform(
      workingDir,
      downloadPath,
      cancellationSignal,
      () => Context.current().heartbeat('audiowaveform'),
    );

    activityLogger.info('Queuing upload of peaks');
    activityLogger.info('Uploading peak json');
    Context.current().heartbeat(`Uploading peak json`);
    await retryablePutFile({
      to: 'PUBLIC',
      key: `${uploadRecordId}/peaks.json`,
      contentType: 'application/json',
      path: peakFiles.json,
      contentLength: (await stat(peakFiles.json)).size,
      signal: cancellationSignal,
    });
    Context.current().heartbeat('Uploaded peak json');
    activityLogger.info('Uploaded peak json');
    activityLogger.info('Uploading peak dat');
    Context.current().heartbeat(`Uploading peak dat`);
    await retryablePutFile({
      to: 'PUBLIC',
      key: `${uploadRecordId}/peaks.dat`,
      contentType: 'application/octet-stream',
      path: peakFiles.dat,
      contentLength: (await stat(peakFiles.dat)).size,
      signal: cancellationSignal,
    });
    Context.current().heartbeat('Uploaded peak dat');
    activityLogger.info('Uploaded peak dat');

    // Upload logs
    activityLogger.info('Queueing upload of logs');
    activityLogger.info('Uploading stdout');
    Context.current().heartbeat('queueing stdout upload');
    await retryablePutFile({
      to: 'INGEST',
      key: `${uploadRecordId}/stdout.txt`,
      contentType: 'text/plain',
      body: Buffer.from(stdout.join('')),
      signal: cancellationSignal,
    });
    activityLogger.info('Done uploading stdout');
    Context.current().heartbeat('queueing stderr upload');
    activityLogger.info('Uploading stderr');
    await retryablePutFile({
      to: 'INGEST',
      key: `${uploadRecordId}/stderr.txt`,
      contentType: 'text/plain',
      body: Buffer.from(stderr.join('')),
      signal: cancellationSignal,
    });
    activityLogger.info('Done uploading stderr');
    Context.current().heartbeat('Uploaded stderr');
    activityLogger.info('Queueing final update for upload record');
    await updateUploadRecord(uploadRecordId, {
      variants,
      transcodingFinishedAt: new Date(),
    });
  } catch (e) {
    activityLogger
      .child({
        meta: JSON.stringify({
          stdout: stdout.join(''),
          stderr: stderr.join(''),
        }),
      })
      .error(e instanceof Error ? e.message : e);
    await updateUploadRecord(uploadRecordId, {
      transcodingStartedAt: null,
      transcodingFinishedAt: null,
    });
    throw e;
  } finally {
    activityLogger.info(`Removing work directory: ${workingDir}`);
    await rimraf(workingDir);
  }
}
