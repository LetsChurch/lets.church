import { confirm } from '@inquirer/prompts';
import all from 'it-all';
import { maxBy, zip } from 'lodash-es';
import ora from 'ora';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { generatePeaksWorkflow } from '../src/temporal/workflows';
import prisma from '../src/util/prisma';
import { headObject, listKeys } from '../src/util/s3';

const uploads = await prisma.uploadRecord.findMany({
  select: { id: true },
  where: {},
  take: Number.MAX_SAFE_INTEGER,
});

if (
  !(await confirm({
    message: `Queue ${uploads.length} uploads for peak generation?`,
    default: false,
  }))
) {
  process.exit(-1);
}

const spinner = ora(`Queueing ${uploads.length} uploads`).start();

for (const { id } of uploads) {
  const keys = await all(listKeys('INGEST', id));
  const heads = await Promise.all(keys.map((key) => headObject('INGEST', key)));
  const keyHeads = zip(keys, heads);
  const [key] = maxBy(keyHeads, ([, h]) => h?.ContentLength ?? 0) ?? [];

  if (key) {
    spinner.text = `Queueing ${key}`;
    await (
      await client
    ).workflow.start(generatePeaksWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `generatePeaks:${id}`,
      args: [id, key],
    });
  }
}

spinner.succeed(`Done! Queued ${uploads.length} uploads for peak generation.`);
