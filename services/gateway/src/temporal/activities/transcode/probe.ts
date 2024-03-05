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

  const stdErrLines: Array<string> = [];
  const stdOutLines: Array<string> = [];

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

    const proc = runFfprobe(workingDir, downloadPath, cancellationSignal);

    proc.stdout?.on('data', (data) => {
      stdOutLines.push(String(data));
    });

    proc.stderr?.on('data', (data) => {
      stdErrLines.push(String(data));
    });

    await proc;

    const probeJson = stdOutLines.join('');
    const parsedProbeJson = JSON.parse(probeJson);
    const schemaParsedProbe = ffprobeSchema.parse(parsedProbeJson);

    await retryablePutFile({
      to: 'INGEST',
      key: `${uploadRecordId}/probe.json`,
      contentType: 'application/json',
      body: Buffer.from(parsedProbeJson),
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
    activityLogger
      .child({
        meta: JSON.stringify({
          stdout: stdOutLines.join(''),
          stderr: stdErrLines.join(''),
        }),
      })
      .error(e instanceof Error ? e.message : e);
    throw e;
  } finally {
    activityLogger.info('Removing working directory');
    await rimraf(workingDir);
  }
}
