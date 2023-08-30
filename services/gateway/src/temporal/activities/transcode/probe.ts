import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import { throttle } from 'lodash-es';
import {
  createPresignedGetUrl,
  headObject,
  retryablePutFile,
} from '../../../util/s3';
import { runFfprobe } from '../../../util/ffmpeg';
import { ffprobeSchema } from '../../../util/zod';
import { updateUploadRecord } from '../..';
import { streamUrlToDisk } from '../../../util/node';

const WORK_DIR = process.env['PROBE_WORKING_DIRECTORY'] ?? '/data/probe';

export default async function probe(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  const dataHeartbeat = throttle(
    (arg = 'data') => Context.current().heartbeat(arg),
    5000,
  );
  const cancellationSignal = Context.current().cancellationSignal;

  const workingDir = join(WORK_DIR, uploadRecordId);

  try {
    console.log('Making working directory');
    await mkdirp(workingDir);

    const downloadPath = join(workingDir, 'download');
    await streamUrlToDisk(
      await createPresignedGetUrl('INGEST', s3UploadKey),
      downloadPath,
      () => dataHeartbeat('download'),
    );
    const uploadSizeBytes = (await headObject('INGEST', s3UploadKey))
      ?.ContentLength;
    invariant(uploadSizeBytes, 'Invalid uploadSizeBytes');
    await mkdirp(workingDir);

    console.log(`Probing ${downloadPath}`);

    const probe = await runFfprobe(
      workingDir,
      downloadPath,
      cancellationSignal,
    );
    const probeJson = probe.stdout;

    const parsedProbe = ffprobeSchema.parse(JSON.parse(probeJson));

    await retryablePutFile({
      to: 'INGEST',
      key: `${uploadRecordId}/probe.json`,
      contentType: 'application/json',
      body: Buffer.from(probeJson),
    });

    await updateUploadRecord(uploadRecordId, {
      uploadSizeBytes,
      lengthSeconds: parseFloat(parsedProbe.format.duration),
    });

    return parsedProbe;
  } catch (e) {
    console.log('Error!');
    console.log(e);
    throw e;
  } finally {
    console.log('Removing working directory');
    await rimraf(workingDir);
  }
}
