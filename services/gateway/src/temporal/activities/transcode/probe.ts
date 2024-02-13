import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import {
  headObject,
  retryablePutFile,
  streamObjectToFile,
} from '../../../util/s3';
import { runFfprobe } from '../../../util/ffmpeg';
import { ffprobeSchema } from '../../../util/zod';
import { updateUploadRecord } from '../..';
import logger from '../../../util/logger';

const WORK_DIR = process.env['PROBE_WORKING_DIRECTORY'] ?? '/data/probe';

const moduleLogger = logger.child({
  module: 'temporal/activities/transcode/probe',
});

export default async function probe(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'probe',
    args: {
      uploadRecordId,
      s3UploadKey,
    },
  });

  const cancellationSignal = Context.current().cancellationSignal;

  const workingDir = join(WORK_DIR, uploadRecordId);

  try {
    activityLogger.info('Making working directory');
    await mkdirp(workingDir);

    const downloadPath = join(workingDir, 'download');
    await streamObjectToFile('INGEST', s3UploadKey, downloadPath, () =>
      Context.current().heartbeat('download'),
    );
    const uploadSizeBytes = (await headObject('INGEST', s3UploadKey))
      ?.ContentLength;
    invariant(uploadSizeBytes, 'Invalid uploadSizeBytes');
    await mkdirp(workingDir);

    activityLogger.info(`Probing ${downloadPath}`);

    const probe = await runFfprobe(
      workingDir,
      downloadPath,
      cancellationSignal,
    );
    const probeJson = probe.stdout;

    const parsedProbe = JSON.parse(probeJson);
    const schemaParsedProbe = ffprobeSchema.parse(parsedProbe);

    await retryablePutFile({
      to: 'INGEST',
      key: `${uploadRecordId}/probe.json`,
      contentType: 'application/json',
      body: Buffer.from(probeJson),
      signal: cancellationSignal,
    });

    await updateUploadRecord(uploadRecordId, {
      probe: probeJson,
      uploadSizeBytes,
      lengthSeconds: parseFloat(schemaParsedProbe.format.duration),
      // TODO: temporarily set portrait videos to private
      ...(schemaParsedProbe.streams.some(
        (s) => s.codec_type === 'video' && s.height > s.width,
      )
        ? { visibility: 'PRIVATE' }
        : {}),
    });

    return schemaParsedProbe;
  } catch (e) {
    activityLogger.error(e instanceof Error ? e.message : e);
    throw e;
  } finally {
    activityLogger.info('Removing working directory');
    await rimraf(workingDir);
  }
}
