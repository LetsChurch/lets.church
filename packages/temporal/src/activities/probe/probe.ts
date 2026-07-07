import { join } from 'node:path';

import { ingestS3 } from '@letschurch/s3/ingest';
import { Context } from '@temporalio/activity';
import { invariant } from 'es-toolkit';
import { mkdirp } from 'mkdirp';
import { rimraf } from 'rimraf';

import { runFfprobe } from '../../util/ffmpeg';
import logger from '../../util/logger';
import { updateUploadRecord } from '../../util/temporal';
import { ffprobeSchema } from '../../util/zod';

const WORK_DIR = process.env.PROBE_WORKING_DIRECTORY ?? '/data/probe';

const moduleLogger = logger.child({
  module: 'activities/probe',
});

export default async function probe(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'probe',
    context: {
      args: {
        uploadRecordId,
        s3UploadKey,
      },
    },
  });

  activityLogger.info(
    {
      uploadId: uploadRecordId,
      s3UploadKey,
      context: {
        workingDir: WORK_DIR,
      },
    },
    'Probe activity started',
  );

  const signal = Context.current().cancellationSignal;

  const workingDir = join(WORK_DIR, uploadRecordId);

  const stdErrLines: Array<string> = [];
  const stdOutLines: Array<string> = [];

  try {
    activityLogger.info('Making working directory');
    await mkdirp(workingDir);

    const downloadPath = join(workingDir, 'download');

    activityLogger.info(
      {
        context: {
          bucket: 'ingest',
          key: s3UploadKey,
        },
      },
      'Fetching file metadata from S3',
    );

    const uploadSizeBytes = (await ingestS3.headObject(s3UploadKey))
      ?.ContentLength;
    invariant(uploadSizeBytes, 'Invalid uploadSizeBytes');

    activityLogger.info(
      {
        context: {
          sizeBytes: uploadSizeBytes,
          sizeMB: (uploadSizeBytes / 1024 / 1024).toFixed(2),
          destination: downloadPath,
        },
      },
      'Starting file download from S3',
    );

    const downloadStart = Date.now();
    await ingestS3.streamObjectToFile(s3UploadKey, downloadPath, {
      signal,
      heartbeat: (progress) => Context.current().heartbeat(progress),
    });
    const downloadDuration = Date.now() - downloadStart;

    activityLogger.info(
      {
        context: {
          durationMs: downloadDuration,
          speedMBps: (
            uploadSizeBytes /
            1024 /
            1024 /
            (downloadDuration / 1000)
          ).toFixed(2),
        },
      },
      'Download complete',
    );

    await mkdirp(workingDir);

    activityLogger.info(
      {
        context: {
          filePath: downloadPath,
          fileSizeMB: (uploadSizeBytes / 1024 / 1024).toFixed(2),
        },
      },
      'Starting ffprobe',
    );

    const probeStart = Date.now();
    const proc = runFfprobe(workingDir, downloadPath, signal);

    proc.stdout?.on('data', (data) => {
      stdOutLines.push(String(data));
    });

    proc.stderr?.on('data', (data) => {
      stdErrLines.push(String(data));
    });

    await proc;
    const probeDuration = Date.now() - probeStart;

    activityLogger.info(
      {
        context: {
          durationMs: probeDuration,
        },
      },
      'ffprobe completed',
    );

    const probeJson = stdOutLines.join('');
    const parsedProbeJson = JSON.parse(probeJson);
    const schemaParsedProbe = ffprobeSchema.parse(parsedProbeJson);

    // Log probe results
    const videoStream = schemaParsedProbe.streams.find(
      (s) => s.codec_type === 'video',
    );
    const audioStream = schemaParsedProbe.streams.find(
      (s) => s.codec_type === 'audio',
    );
    const isPortrait = videoStream && videoStream.height > videoStream.width;

    activityLogger.info(
      {
        context: {
          format: schemaParsedProbe.format.format_name,
          duration: parseFloat(schemaParsedProbe.format.duration),
          streamCount: schemaParsedProbe.streams.length,
          videoCodec: videoStream?.codec_name,
          videoResolution: videoStream
            ? `${videoStream.width}x${videoStream.height}`
            : null,
          videoFps: videoStream?.avg_frame_rate,
          audioCodec: audioStream?.codec_name,
          audioChannels: audioStream?.channels,
          audioSampleRate: audioStream?.sample_rate,
          isPortrait,
        },
      },
      'Media probe results',
    );

    activityLogger.info(
      {
        uploadId: uploadRecordId,
        context: {
          key: `${uploadRecordId}/probe.json`,
          sizeKB: (probeJson.length / 1024).toFixed(2),
        },
      },
      'Uploading probe results to S3',
    );

    await ingestS3.retryablePutFile({
      key: `${uploadRecordId}/probe.json`,
      contentType: 'application/json',
      body: Buffer.from(probeJson),
      signal,
    });

    const visibilityUpdate = schemaParsedProbe.streams.some(
      (s) => s.codec_type === 'video' && s.height > s.width,
    )
      ? { visibility: 'PRIVATE' as const }
      : {};

    if (visibilityUpdate.visibility) {
      activityLogger.info(
        'Setting upload visibility to PRIVATE (portrait video detected)',
      );
    }

    activityLogger.info('Updating upload record with probe data');

    await updateUploadRecord(uploadRecordId, {
      probe: probeJson,
      uploadSizeBytes,
      lengthSeconds: parseFloat(schemaParsedProbe.format.duration),
      // TODO: temporarily set portrait videos to private
      ...visibilityUpdate,
    });

    activityLogger.info(
      {
        context: {
          totalDurationMs: Date.now() - probeStart + downloadDuration,
          mediaLengthSeconds: parseFloat(schemaParsedProbe.format.duration),
        },
      },
      'Probe activity completed successfully',
    );

    return schemaParsedProbe;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));

    activityLogger.error(
      {
        uploadId: uploadRecordId,
        s3UploadKey,
        context: {
          error: error.message,
          stack: error.stack,
          stdout: stdOutLines.join(''),
          stderr: stdErrLines.join(''),
        },
      },
      'Probe activity failed',
    );

    throw e;
  } finally {
    activityLogger.info(
      {
        context: {
          workingDir,
        },
      },
      'Removing working directory',
    );
    await rimraf(workingDir);
  }
}
