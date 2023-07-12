import all from 'it-all';
import { maxBy } from 'lodash-es';
import prisma from '../src/util/prisma';
import { listObjects } from '../src/util/s3';

const uploads = await prisma.uploadRecord.findMany({
  select: { id: true },
  take: Number.MAX_SAFE_INTEGER,
});

console.log(`Backfilling ${uploads.length} uploads`);

for (const { id } of uploads) {
  const objects = await all(listObjects('INGEST', id));
  console.log(`Found ${objects.length} objects for ${id}`);
  const maxSize = maxBy(objects, (o) => o.Size);
  if (maxSize?.Key) {
    console.log(`Recording finalized upload key for ${id}`);
    await prisma.uploadRecord.update({
      where: { id },
      data: { finalizedUploadKey: maxSize.Key },
    });
  } else {
    console.log(`No max size key for ${id}`);
  }
}
