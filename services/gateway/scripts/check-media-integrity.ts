import { writeFile } from 'fs/promises';
import ora from 'ora';
import invariant from 'tiny-invariant';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Parser } from 'm3u8-parser';
import { input } from '@inquirer/prompts';
import prisma from '../src/util/prisma';
import { getObject } from '../src/util/s3';

const filename = await input({ message: 'File name:', default: 'report.json' });

const uploads = await prisma.uploadRecord.findMany({
  select: { id: true, variants: true, lengthSeconds: true },
  take: Number.MAX_SAFE_INTEGER,
  where: {
    transcodingFinishedAt: { not: null },
    transcribingFinishedAt: { not: null },
  },
});

const total = uploads.length;

const spinner = ora(`Checking ${total} uploads`).start();

const records: Array<{
  id: string;
  expectedLength: number;
  actualLengths: Partial<Record<string, number>>;
}> = [];

for (let i = 0; i < total; i += 1) {
  spinner.text = `Checking upload ${i}/${total}`;
  const upload = uploads[i];

  invariant(upload, 'Upload not found');

  const { id, variants, lengthSeconds } = upload;

  invariant(lengthSeconds, 'Invalid expected length');

  const record: (typeof records)[number] = {
    id,
    expectedLength: lengthSeconds,
    actualLengths: {},
  };

  for (const variant of variants) {
    if (variant.endsWith('_DOWNLOAD')) {
      continue;
    }

    const s3Key = `${id}/${variant}.m3u8`;

    try {
      const res = await getObject('PUBLIC', s3Key);

      if (!res.Body) {
        record.actualLengths[variant] = 0;
        continue;
      }

      const text = await res.Body.transformToString('utf-8');

      const parser = new Parser();
      parser.push(text);
      parser.end();
      const parsed = parser.manifest;

      const actualDuration = parsed.segments.reduce(
        (total: number, segment: { duration: number }) =>
          total + segment.duration,
        0,
      );

      if (Math.abs(actualDuration - lengthSeconds) > 5) {
        record.actualLengths[variant] = parsed.totalDuration;
      }
    } catch (err) {
      console.log(err);
      continue;
    }
  }

  if (Object.keys(record.actualLengths).length > 0) {
    records.push(record);
  }
}

spinner.succeed('Done!');

console.log(`Found ${records.length} uploads with mismatched lengths`);

await writeFile(filename, JSON.stringify(records, null, 2));
