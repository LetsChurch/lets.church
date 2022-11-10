import { join } from 'node:path';
import { Context } from '@temporalio/activity';
import mkdirp from 'mkdirp';
import { retryablePutFile, streamObjectToFile } from '../../util/s3';
import { runFfprobe } from '../../util/ffmpeg';
import { ffprobeSchema } from '../../util/zod';
import rimraf from '../../util/rimraf';

const WORK_DIR = '/data/transcode';

export default async function probe(id: string) {
  Context.current().heartbeat();

  const dir = join(WORK_DIR, id);
  const downloadPath = join(dir, id);

  try {
    await mkdirp(dir);
    await streamObjectToFile(id, downloadPath);

    Context.current().heartbeat();

    console.log(`Probing ${downloadPath}`);

    const probe = await runFfprobe(dir, downloadPath);
    const probeJson = probe.stdout;

    const parsedProbe = ffprobeSchema.parse(JSON.parse(probeJson));

    await retryablePutFile(
      `${id}.probe.json`,
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
