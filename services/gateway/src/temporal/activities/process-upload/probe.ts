import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import { throttle } from 'lodash-es';
import rimraf from 'rimraf';
import {
  retryablePutFile,
  S3_INGEST_BUCKET,
  streamObjectToFile,
} from '../../../util/s3';
import { runFfprobe } from '../../../util/ffmpeg';
import { ffprobeSchema } from '../../../util/zod';
import prisma from '../../../util/prisma';

const WORK_DIR = '/data/transcode';

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
      S3_INGEST_BUCKET,
      s3UploadKey,
      downloadPath,
      throttle(() => Context.current().heartbeat(), 5000),
    );

    Context.current().heartbeat();

    console.log(`Probing ${downloadPath}`);

    const stats = await stat(downloadPath);

    await prisma.uploadRecord.update({
      where: { id: uploadRecordId },
      data: { uploadSizeBytes: stats.size },
    });

    const probe = await runFfprobe(dir, downloadPath, cancellationSignal);
    const probeJson = probe.stdout;

    const parsedProbe = ffprobeSchema.parse(JSON.parse(probeJson));

    await retryablePutFile(
      S3_INGEST_BUCKET,
      `${uploadRecordId}.probe.json`,
      'application/json',
      Buffer.from(probeJson),
    );

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
