import { writeFile } from 'fs/promises';
import ora from 'ora';
import invariant from 'tiny-invariant';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Parser } from 'm3u8-parser';
import { input } from '@inquirer/prompts';
import pFilter from 'p-filter';
import pOne from 'p-one';
import prisma from '../src/util/prisma';
import { getObject } from '../src/util/s3';

const filename = await input({ message: 'File name:', default: 'errors.txt' });

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

const erroredIds = (
  await pFilter(
    uploads,
    (upload, i) => {
      spinner.text = `Checking upload ${i}/${total}`;

      const { id, variants, lengthSeconds } = upload;

      invariant(lengthSeconds, 'Invalid expected length');
      invariant(variants.length > 0, 'Invalid variants');

      return pOne(
        variants.filter((v) => !v.endsWith('_DOWNLOAD')),
        async (variant) => {
          const s3Key = `${id}/${variant}.m3u8`;

          try {
            const res = await getObject('PUBLIC', s3Key);

            if (!res.Body) {
              return true; // Error!
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
              return true; // Error!
            }

            return false; // All good!
          } catch (err) {
            return true; // Error!
          }
        },
      );
    },
    { concurrency: 10 },
  )
).map(({ id }) => id);

spinner.succeed('Done!');

console.log(`Found ${erroredIds.length} uploads with mismatched lengths`);

await writeFile(filename, erroredIds.join('\n'));
