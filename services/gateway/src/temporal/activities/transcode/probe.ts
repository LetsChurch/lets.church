import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import { throttle } from 'lodash-es';
import rimraf from 'rimraf';
import { retryablePutFile, streamObjectToFile } from '../../../util/s3';
import { runFfprobe } from '../../../util/ffmpeg';
import { ffprobeSchema } from '../../../util/zod';
import { updateUploadRecord } from '../..';

const WORK_DIR = process.env['PROBE_WORKING_DIRECTORY'] ?? '/data/probe';

export default async function probe(
  uploadRecordId: string,
  s3UploadKey: string,
) {
  Context.current().heartbeat();
  const cancellationSignal = Context.current().cancellationSignal;

  const dir = join(WORK_DIR, uploadRecordId);
  const downloadPath = join(dir, 'download');

  try {
    await mkdirp(dir);
    await streamObjectToFile(
      'INGEST',
      s3UploadKey,
      downloadPath,
      throttle(() => Context.current().heartbeat('probe download'), 5000),
    );

    Context.current().heartbeat('probe done downloading');

    console.log(`Probing ${downloadPath}`);

    const stats = await stat(downloadPath);
    const probe = await runFfprobe(dir, downloadPath, cancellationSignal);
    const probeJson = probe.stdout;

    const parsedProbe = ffprobeSchema.parse(JSON.parse(probeJson));

    await retryablePutFile({
      to: 'INGEST',
      key: `${uploadRecordId}/probe.json`,
      contentType: 'application/json',
      body: Buffer.from(probeJson),
    });

    await updateUploadRecord(uploadRecordId, {
      uploadSizeBytes: stats.size,
      lengthSeconds: parseFloat(parsedProbe.format.duration),
    });

    return parsedProbe;
  } catch (e) {
    console.log('Error!');
    console.log(e);
    throw e;
  } finally {
    console.log('Removing working directory');
    await rimraf(dir);
  }
}

export type Probe = Exclude<Awaited<ReturnType<typeof probe>>, null>;
