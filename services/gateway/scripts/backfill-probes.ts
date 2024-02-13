import pMap from 'p-map';
import { type Prisma } from '@prisma/client';
import ora from 'ora';
import { getObject } from '../src/util/s3';
import { getLoglessClient } from '../src/util/prisma';

const prisma = getLoglessClient();

async function getProbe(uploadRecordId: string) {
  const file = await getObject('INGEST', `${uploadRecordId}/probe.json`);
  const body = await file.Body?.transformToString();
  return body ? (JSON.parse(body) as Prisma.JsonObject) : null;
}

const ids = await prisma.uploadRecord.findMany({
  select: { id: true },
  where: { finalizedUploadKey: { not: null } },
  take: Number.MAX_SAFE_INTEGER,
});

const spinner = ora('Backfilling probes').start();

let done = 0;

await pMap(
  ids,
  async ({ id }) => {
    const probe = await getProbe(id);

    if (!probe) {
      console.warn(`No probe for ${id}`);
      return;
    }

    await prisma.uploadRecord.update({
      where: { id },
      data: { probe },
    });

    done += 1;

    spinner.text = `Backfilled ${done} / ${ids.length} probes`;
  },
  { concurrency: 10 },
);

spinner.succeed(`Backfilled ${done} probes`);
