import { writeFile } from 'fs/promises';
import { input, confirm } from '@inquirer/prompts';
import { client } from '../src/temporal';
import prisma from '../src/util/prisma';
import { headObject, listKeys } from '../src/util/s3';
import { deleteUploadWorkflow } from '../src/temporal/workflows';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';

const startDate = await input({ message: 'Start date: ' });
const endDate = await input({ message: 'End date: ' });
const outputFile = await input({ message: 'Output file: ' });

const uploads = await prisma.uploadRecord.findMany({
  select: { id: true, variants: true },
  where: {
    createdAt: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    },
  },
  take: Number.MAX_SAFE_INTEGER,
});

console.log(
  `Checking ${uploads.length} uploads between ${startDate} and ${endDate}`,
);

type ErrorEntry = {
  missingIngest: boolean;
  missingVariants: boolean;
  missingVideo: boolean;
  missingAudio: boolean;
  missingHovernail: boolean;
  missingPeaks: boolean;
};

const errors = new Map<string, ErrorEntry>();

function getErrorEntry(id: string): ErrorEntry {
  const entry = errors.get(id);

  if (entry) {
    return entry;
  }

  const value = {
    missingIngest: false,
    missingVariants: false,
    missingVideo: false,
    missingAudio: false,
    missingHovernail: false,
    missingPeaks: false,
  };

  errors.set(id, value);

  return value;
}

for (const { id, variants } of uploads) {
  console.log(`Checking ${id}`);

  const ingestKeys = await listKeys('INGEST', id);

  if (ingestKeys.length === 0) {
    console.log(`${id}: missing ingest`);
    getErrorEntry(id).missingIngest = true;

    continue;
  }

  if (variants.length === 0) {
    console.log(`${id}: missing variants`);
    getErrorEntry(id).missingVariants = true;

    continue;
  }

  const hasVideo = variants.some((v) => v.startsWith('VIDEO'));

  if (hasVideo) {
    const res = await headObject('PUBLIC', `${id}/master.m3u8`);

    if (!res) {
      console.log(`${id}: missing video`);
      getErrorEntry(id).missingVideo = true;
    }

    const hovernailRes = await headObject('PUBLIC', `${id}/hovernail.jpg`);

    if (!hovernailRes) {
      console.log(`${id}: missing hoverail`);
      getErrorEntry(id).missingHovernail = true;
    }
  }

  const res = await headObject('PUBLIC', `${id}/AUDIO.m3u8`);

  if (!res) {
    console.log(`${id}: missing audio`);
    getErrorEntry(id).missingAudio = true;
  }

  const peaksJsonRes = await headObject('PUBLIC', `${id}/peaks.json`);
  const peaksDatRes = await headObject('PUBLIC', `${id}/peaks.dat`);

  if (!peaksJsonRes || !peaksDatRes) {
    console.log(`${id}: missing peaks`);
    getErrorEntry(id).missingPeaks = true;
  }
}

console.log(`Writing errors to ${outputFile}`);

await writeFile(
  outputFile,
  JSON.stringify(Object.fromEntries(errors.entries()), null, 2),
);

console.log(`Wrote ${errors.size} errored upload records`);

if (
  !(await confirm({
    message: `Queue ${errors.size} for deletion?`,
    default: false,
  }))
) {
  process.exit(0);
}

for (const id of errors.keys()) {
  await (
    await client
  ).workflow.start(deleteUploadWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `deleteUploadRecord:${id}`,
    args: [id],
  });
}
