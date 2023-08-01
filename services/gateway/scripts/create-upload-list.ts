import { input, select } from '@inquirer/prompts';
import { UploadListType } from '@prisma/client';
import { LexoRank } from 'lexorank';
import prisma from '../src/util/prisma';

const type = await select({
  message: 'Type:',
  choices: [
    { value: UploadListType.SERIES, name: 'Series' },
    { value: UploadListType.PLAYLIST, name: 'Playlist' },
  ],
});

const title = await input({ message: 'Title:' });
const username = await input({ message: 'Username:' });

const ids: Array<string> = [];

ids.push(
  ...(await input({ message: 'ids (comma-separated):' }))
    .split(/,/g)
    .map((s) => s.trim()),
);

const series = await prisma.uploadList.create({
  select: { id: true },
  data: {
    type: type as UploadListType,
    title,
    author: { connect: { username } },
  },
});

let nextRank: string = LexoRank.middle().toString();

for (const id of ids) {
  await prisma.uploadListEntry.create({
    data: {
      rank: nextRank,
      upload: {
        connect: {
          id,
        },
      },
      uploadList: {
        connect: {
          id: series.id,
        },
      },
    },
  });

  nextRank = LexoRank.parse(nextRank).between(LexoRank.max()).toString();
}
