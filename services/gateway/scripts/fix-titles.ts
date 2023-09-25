import { decodeHTML } from 'entities';
import prisma from '../src/util/prisma';

const records = await prisma.$queryRaw<
  Array<{ id: string; title: string }>
>`SELECT id, title FROM upload_record WHERE title LIKE '%&%;%';`;

for (const { id, title } of records) {
  const newTitle = decodeHTML(title).trim();

  console.log(id);
  console.log(title);
  console.log(newTitle);
  console.log('---');

  await prisma.uploadRecord.update({
    where: { id },
    data: { title: newTitle },
  });
}
