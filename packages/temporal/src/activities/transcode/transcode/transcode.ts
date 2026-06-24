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
import { amaBudgetEnabled, amaEncodeBudget } from '../../../util/ama-budget';
import { runAudiowaveform } from '../../../util/audiowaveform';
import {
  getVariants,
  probeFrameRate,
  probeToDecodeCost,
  resolveHwAccel,
  runFfmpegEncode,
  variantsToEncodeCost,
  variantsToMasterVideoPlaylist,
} from '../../../util/ffmpeg';
import logger from '../../../util/logger';
import type { Probe } from '../../../util/zod';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcode/transcode',
});

const HW_ACCEL = resolveHwAccel();

const WORK_DIR = process.env.TRANSCODE_WORKING_DIRECTORY ?? '/data/transcode';

const formatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

// Matches the HLS artifacts transcode produces: fMP4 init segments,
// media segments, and playlists. Used to scope the post-transcode
// stale-file cleanup so non-HLS artifacts (thumbnails, transcript.*,
// peaks.*) are preserved.
function isHlsArtifact(filename: string): boolean {
  return (
    /\.m4s$/i.test(filename) ||
    /\.m3u8$/i.test(filename) ||
    /_init\.mp4$/i.test(filename)
  );
}

async function uploadSegments(
  id: string,
  dir: string,
  log: typeof logger,
  excludeInit: boolean,
  // Records the basename of every uploaded segment so the caller can
  // diff against existing S3 keys and prune stale ones afterward.
  writtenFiles: Set<string>,
) {
  const patterns = excludeInit
    ? [join(dir, '*.m4s')]
    : [join(dir, '*_init.mp4'), join(dir, '*.m4s')];
  const segmentFiles = await fastGlob(patterns);
  const signal = Context.current().cancellationSignal;

  for (const path of segmentFiles) {
    const filename = basename(path);
    Context.current().heartbeat(`Starting upload: ${path}`);
    log.info(`Uploading media segment: ${path}`);

    await publicS3.retryablePutFile({
      key: `${id}/${filename}`,
      contentType: 'video/mp4',
      contentLength: (await stat(path)).size,
      path,
      signal,
    });
    writtenFiles.add(filename);

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
  const throttledUpdateUploadRecord = throttle(
    (id: string, data: Parameters<typeof updateUploadRecord>[1]) =>
      updateUploadRecord(id, data, true),
    2500,
  );

  await updateUploadRecord(uploadRecordId, {
    transcodingStartedAt: new Date(),
  });

  const stdout: Array<string> = [];
  const stderr: Array<string> = [];

  // Basenames of every HLS file written this run (segments, init
  // segments, and playlists). After encoding we diff this against the
  // existing S3 objects to prune stale segments from a prior encode
  // WITHOUT a destructive up-front wipe — the old rendition stays
  // playable until the new one is fully uploaded.
  const writtenFiles = new Set<string>();

  // On the AMA hardware path, a job must claim a share of the device's encoder
  // budget before it can start ffmpeg (see util/ama-budget.ts). `releaseBudget`
  // is the idempotent handle that returns those units; it stays a no-op on the
  // CPU path and until the budget is actually acquired.
  let releaseBudget: () => void = () => {};

  try {
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

    // Claim device budget on the AMA path so we don't oversubscribe the card.
    // This may block until in-flight jobs free up enough units; keep
    // heartbeating so Temporal doesn't time the activity out while it waits.
    if (amaBudgetEnabled) {
      const frameRate = probeFrameRate(probe);
      // Charge the larger of this job's encode and decode load. A transcode uses
      // both engines (decode source -> encode ladder); the ladder cost is NOT
      // always >= the source decode cost (e.g. a 1440p source decodes ~1.78 but
      // its ladder tops out at 1080p), so taking the max keeps BOTH the encoder
      // and decoder pools bounded by the single budget. See util/ama-budget.ts.
      const cost = Math.max(
        variantsToEncodeCost(variants, frameRate),
        probeToDecodeCost(probe, frameRate),
      );
      if (cost > 0) {
        activityLogger.info(
          `Acquiring AMA device budget (cost: ${cost.toFixed(
            2,
          )} units @ ${frameRate.toFixed(2)}fps, free: ${amaEncodeBudget
            .free()
            .toFixed(2)}/${amaEncodeBudget.total})`,
        );
        const waitHeartbeat = setInterval(
          () => Context.current().heartbeat('waiting for AMA encode budget'),
          30_000,
        );
        try {
          releaseBudget = await amaEncodeBudget.acquire(cost, signal);
        } finally {
          clearInterval(waitHeartbeat);
        }
        activityLogger.info('Acquired AMA device budget');
      }
    }

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
      await uploadSegments(
        uploadRecordId,
        workingDir,
        activityLogger,
        true,
        writtenFiles,
      );
      await setTimeout(1000);
    }

    await uploadSegments(
      uploadRecordId,
      workingDir,
      activityLogger,
      false,
      writtenFiles,
    );

    const encodeProcRes = await encodeProc;

    // ffmpeg (and therefore the device encoder) is done — return our budget
    // immediately so another job can start while we finish uploads, peaks, and
    // logs, none of which touch the device. Idempotent with the finally below.
    releaseBudget();

    activityLogger.info(`ffmpeg finished with code ${encodeProcRes.exitCode}`);

    activityLogger.info('Cancelling remaining upload record updates');

    throttledUpdateUploadRecord.cancel();

    activityLogger.info('Marking transcoding progress as done');
    await updateUploadRecord(uploadRecordId, { transcodingProgress: 1 }, true);

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
      writtenFiles.add(filename);
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
      writtenFiles.add('master.m3u8');
      Context.current().heartbeat('Uploaded master playlist file');
      activityLogger.info('Uploaded master playlist file');
    } else {
      activityLogger.info(
        `Not creating master playlist given the variants: ${formatter.format(
          variants,
        )}`,
      );
    }

    // Prune stale HLS artifacts left over from a previous encode that
    // the new output didn't overwrite — e.g. higher-indexed segments
    // from a longer prior render, or a variant rendition no longer
    // produced. Scoped to HLS files (segments/init/playlists) so
    // thumbnails, transcript.*, peaks.*, and probe data are preserved.
    // Runs only after every new segment + playlist is uploaded, so the
    // upload is never left without a playable rendition.
    activityLogger.info('Cleaning up stale HLS segments');
    const staleKeys: string[] = [];
    for await (const key of publicS3.listKeys(`${uploadRecordId}/`)) {
      const filename = key.slice(uploadRecordId.length + 1);
      if (isHlsArtifact(filename) && !writtenFiles.has(filename)) {
        staleKeys.push(key);
      }
    }
    if (staleKeys.length > 0) {
      activityLogger.info(`Deleting ${staleKeys.length} stale HLS segments`);
      await publicS3.deleteKeys(staleKeys, () =>
        Context.current().heartbeat('deleteStaleSegments'),
      );
    }
    activityLogger.info('Stale HLS segments cleaned up');

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
      // Record how this transcode encoded the upload (see schema).
      transcodeEncoder: HW_ACCEL.startsWith('ama:') ? 'h264_ama' : 'libx264',
      // Current pipeline emits a separate audio rendition whenever the
      // upload has both video and audio; audio-only / video-only have
      // nothing to split.
      splitAudio:
        variants.some((v) => v.startsWith('VIDEO')) &&
        variants.includes('AUDIO'),
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
    // Safety net: return any still-held encode budget (e.g. ffmpeg threw before
    // the post-encode release). Idempotent, so the success path's earlier
    // release makes this a no-op.
    releaseBudget();
    activityLogger.info(`Removing work directory: ${workingDir}`);
    await rimraf(workingDir);
  }
}
