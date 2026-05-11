import { stat, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { Context } from '@temporalio/activity';
import { throttle } from 'es-toolkit';
import fastGlob from 'fast-glob';
import { mkdirp } from 'mkdirp';
import { rimraf } from 'rimraf';
import { updateUploadRecord } from '../../../client';
import { CURRENT_PIPELINE_VERSION } from '../../../queues';
import { runAudiowaveform } from '../../../util/audiowaveform';
import {
  getVariants,
  type HwAccel,
  runFfmpegEncode,
  variantsToMasterVideoPlaylist,
} from '../../../util/ffmpeg';
import logger from '../../../util/logger';
import type { Probe } from '../../../util/zod';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcode/transcode',
});

const hwAccelEnv = process.env.TRANSCODE_HW_ACCEL;
const HW_ACCEL: HwAccel = hwAccelEnv?.startsWith('ama')
  ? (hwAccelEnv as HwAccel)
  : 'none';

const WORK_DIR = process.env.TRANSCODE_WORKING_DIRECTORY ?? '/data/transcode';

const formatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

async function uploadSegments(
  id: string,
  dir: string,
  log: typeof logger,
  excludeInit = false,
) {
  const patterns = excludeInit
    ? [join(dir, '*.m4s')]
    : [join(dir, '*_init.mp4'), join(dir, '*.m4s')];
  const segmentFiles = await fastGlob(patterns);
  const signal = Context.current().cancellationSignal;

  for (const path of segmentFiles) {
    Context.current().heartbeat(`Starting upload: ${path}`);
    log.info(`Uploading media segment: ${path}`);

    await publicS3.retryablePutFile({
      key: `${id}/${basename(path)}`,
      contentType: 'video/mp4',
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
    context: {
      args: {
        s3UploadKey,
      },
    },
  });

  Context.current().heartbeat('job start');
  const signal = Context.current().cancellationSignal;
  const workingDir = join(WORK_DIR, uploadRecordId);
  const throttledUpdateUploadRecord = throttle(updateUploadRecord, 2500);

  await updateUploadRecord(uploadRecordId, {
    transcodingStartedAt: new Date(),
  });

  const stdout: Array<string> = [];
  const stderr: Array<string> = [];

  try {
    activityLogger.info(`Cleaning up old media files for ${uploadRecordId}`);
    const keysToDelete: string[] = [];
    for await (const key of publicS3.listKeys(`${uploadRecordId}/`)) {
      const filename = key.slice(uploadRecordId.length + 1);
      if (
        !filename.startsWith('transcript.') &&
        !/\.(jpg|jpeg|png|webp)$/i.test(filename)
      ) {
        keysToDelete.push(key);
      }
    }
    if (keysToDelete.length > 0) {
      activityLogger.info(`Deleting ${keysToDelete.length} old media files`);
      await publicS3.deleteKeys(keysToDelete, () =>
        Context.current().heartbeat('deleteOldMedia'),
      );
    }
    activityLogger.info('Old media files cleaned up');

    activityLogger.info(`Making work directory: ${workingDir}`);

    await mkdirp(workingDir);
    const downloadPath = join(workingDir, 'download');
    await ingestS3.streamObjectToFile(s3UploadKey, downloadPath, () =>
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
      signal,
      hwAccel: HW_ACCEL,
    });

    encodeProc.stdout?.on('data', (data) => {
      const str = String(data);
      stdout.push(str);

      const match = str.match(/frame=(\d+)/);

      if (!match) {
        return;
      }

      const frames = parseInt(match[1] ?? '', 10);
      const totalFrames = parseInt(
        // TODO: get progress when nb_frames is undefined
        String(probe.streams.find((s) => s.nb_frames)?.nb_frames) ?? '',
        10,
      );

      if (!Number.isNaN(frames) && !Number.isNaN(totalFrames)) {
        const progress = frames / totalFrames;
        throttledUpdateUploadRecord(uploadRecordId, {
          transcodingProgress: progress,
        });
      }
    });

    encodeProc.stderr?.on('data', (data) => stderr.push(String(data)));

    while (encodeProc.exitCode === null) {
      Context.current().heartbeat('waiting for ffmpeg');
      await uploadSegments(uploadRecordId, workingDir, activityLogger, true);
      await setTimeout(1000);
    }

    await uploadSegments(uploadRecordId, workingDir, activityLogger);

    const encodeProcRes = await encodeProc;

    activityLogger.info(`ffmpeg finished with code ${encodeProcRes.exitCode}`);

    activityLogger.info('Cancelling remaining upload record updates');

    throttledUpdateUploadRecord.cancel();

    activityLogger.info('Marking transcoding progress as done');
    await updateUploadRecord(uploadRecordId, { transcodingProgress: 1 });

    activityLogger.info('Finding playlist files');

    const playlists = await fastGlob(join(workingDir, '*.m3u8'));

    activityLogger.info(`Found playlist files:\n - ${playlists.join('\n -')}`);
    activityLogger.info(`Uploading ${playlists.length} playlist files`);

    // Upload playlist files
    for (const path of playlists) {
      const filename = basename(path);
      Context.current().heartbeat(`Uploading playlist file`);
      activityLogger.info(`Uploading playlist file: ${filename}`);
      await publicS3.retryablePutFile({
        key: `${uploadRecordId}/${filename}`,
        contentType: 'application/x-mpegURL',
        path,
        contentLength: (await stat(path)).size,
        signal,
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
      await publicS3.retryablePutFile({
        key: `${uploadRecordId}/master.m3u8`,
        contentType: 'application/x-mpegURL',
        body: playlistBuffer,
        signal,
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
      signal,
      () => Context.current().heartbeat('audiowaveform'),
    );

    activityLogger.info('Queuing upload of peaks');
    activityLogger.info('Uploading peak json');
    Context.current().heartbeat(`Uploading peak json`);
    await publicS3.retryablePutFile({
      key: `${uploadRecordId}/peaks.json`,
      contentType: 'application/json',
      path: peakFiles.json,
      contentLength: (await stat(peakFiles.json)).size,
      signal,
    });
    Context.current().heartbeat('Uploaded peak json');
    activityLogger.info('Uploaded peak json');
    activityLogger.info('Uploading peak dat');
    Context.current().heartbeat(`Uploading peak dat`);
    await publicS3.retryablePutFile({
      key: `${uploadRecordId}/peaks.dat`,
      contentType: 'application/octet-stream',
      path: peakFiles.dat,
      contentLength: (await stat(peakFiles.dat)).size,
      signal,
    });
    Context.current().heartbeat('Uploaded peak dat');
    activityLogger.info('Uploaded peak dat');

    // Upload logs
    activityLogger.info('Queueing upload of logs');
    activityLogger.info('Uploading stdout');
    Context.current().heartbeat('queueing stdout upload');
    await ingestS3.retryablePutFile({
      key: `${uploadRecordId}/stdout.txt`,
      contentType: 'text/plain',
      body: Buffer.from(stdout.join('')),
      signal,
    });
    activityLogger.info('Done uploading stdout');
    Context.current().heartbeat('queueing stderr upload');
    activityLogger.info('Uploading stderr');
    await ingestS3.retryablePutFile({
      key: `${uploadRecordId}/stderr.txt`,
      contentType: 'text/plain',
      body: Buffer.from(stderr.join('')),
      signal,
    });
    activityLogger.info('Done uploading stderr');
    Context.current().heartbeat('Uploaded stderr');
    activityLogger.info('Queueing final update for upload record');
    await updateUploadRecord(uploadRecordId, {
      variants,
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      transcodingFinishedAt: new Date(),
    });
  } catch (e) {
    activityLogger
      .child({
        context: {
          meta: JSON.stringify({
            stdout: stdout.join(''),
            stderr: stderr.join(''),
          }),
        },
      })
      .error(
        { err: e instanceof Error ? e : new Error(String(e)) },
        'Failed to transcode',
      );
    try {
      await updateUploadRecord(uploadRecordId, {
        transcodingStartedAt: null,
        transcodingFinishedAt: null,
        transcodingProgress: 0,
      });
    } catch (resetErr) {
      activityLogger.error(
        {
          err:
            resetErr instanceof Error ? resetErr : new Error(String(resetErr)),
        },
        'Failed to reset upload record after transcode failure',
      );
    }
    throw e;
  } finally {
    activityLogger.info(`Removing work directory: ${workingDir}`);
    await rimraf(workingDir);
  }
}
