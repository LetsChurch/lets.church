import { faker } from '@faker-js/faker';
import slugify from '@sindresorhus/slugify';
import argon2 from 'argon2';
import { Prisma, UploadListType } from '@prisma/client';
import invariant from 'tiny-invariant';
import { LexoRank } from 'lexorank';
import { indexDocument, waitOnTemporal } from '../src/temporal';
import prisma from '../src/util/prisma';

faker.seed(1337);

await waitOnTemporal();

const password = await argon2.hash('password', { type: argon2.argon2id });

const usersData: ReadonlyArray<
  Parameters<typeof prisma.appUser.create>[0]['data']
> = [
  {
    username: 'admin',
    password,
    role: 'ADMIN',
    emails: {
      create: { email: 'admin@lets.church', verifiedAt: new Date() },
    },
  },
  {
    username: 'user1',
    fullName: 'User One',
    password,
    emails: {
      create: { email: 'user1@example.org', verifiedAt: new Date() },
    },
  },
  {
    username: 'user2',
    fullName: 'User Two',
    password,
    emails: {
      create: { email: 'user2@example.org', verifiedAt: new Date() },
    },
  },
  {
    username: 'user3',
    fullName: 'User Three',
    password,
    emails: {
      create: { email: 'user3@example.org', verifiedAt: new Date() },
    },
  },
  {
    username: 'user4',
    fullName: 'User Four',
    password,
    emails: {
      create: { email: 'user4@example.org', verifiedAt: new Date() },
    },
  },
  {
    username: 'user5',
    fullName: 'User Five',
    password,
    emails: {
      create: { email: 'user5@example.org', verifiedAt: new Date() },
    },
  },
] as const;

const [adminUser, user1, user2] = await Promise.all(
  usersData.map((d) => prisma.appUser.create({ data: d })),
);

invariant(adminUser && user1 && user2);

const otherIds = (
  await prisma.appUser.findMany({
    where: { username: { notIn: ['admin', 'user1', 'user2'] } },
  })
).map(({ id }) => id);

const { id: lcId, associations: lcAssociations } =
  await prisma.organization.create({
    include: {
      associations: { include: { channel: { select: { id: true } } } },
    },
    data: {
      name: "Let's Church",
      slug: 'letschurch',
      memberships: {
        create: {
          appUser: {
            connect: {
              id: adminUser.id,
            },
          },
          isAdmin: true,
        },
      },
      associations: {
        create: {
          channel: {
            create: {
              name: "Let's Church",
              slug: 'letschurch',
              memberships: {
                create: {
                  appUser: {
                    connect: {
                      id: adminUser.id,
                    },
                  },
                  isAdmin: true,
                },
              },
              subscribers: {
                create: {
                  appUser: {
                    connect: {
                      id: adminUser.id,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

const { id: flId, associations: flAssociations } =
  await prisma.organization.create({
    include: {
      associations: { include: { channel: { select: { id: true } } } },
    },
    data: {
      name: 'FirstLove Publications',
      slug: 'firstlove',
      memberships: {
        create: {
          appUser: {
            connect: {
              id: adminUser.id,
            },
          },
          isAdmin: true,
        },
      },
      associations: {
        create: {
          channel: {
            create: {
              name: 'FirstLove Publications',
              slug: 'firstlove',
              memberships: {
                create: {
                  appUser: {
                    connect: {
                      id: adminUser.id,
                    },
                  },
                  isAdmin: true,
                },
              },
              subscribers: {
                create: {
                  appUser: {
                    connect: {
                      id: adminUser.id,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

await indexDocument('organization', lcId);
await indexDocument('organization', flId);

await Promise.all([
  ...lcAssociations.map(({ channel }) => indexDocument('channel', channel.id)),
  ...flAssociations.map(({ channel }) => indexDocument('channel', channel.id)),
]);

const { id: org1Id, associations: org1Associations } =
  await prisma.organization.create({
    include: {
      associations: { include: { channel: { select: { id: true } } } },
    },
    data: {
      name: 'Organization 1',
      slug: 'org1',
      memberships: {
        create: {
          appUser: {
            connect: {
              id: user1.id,
            },
          },
          isAdmin: true,
        },
      },
      associations: {
        create: {
          channel: {
            create: {
              name: 'Channel 1',
              slug: 'ch1',
              memberships: {
                create: {
                  appUser: {
                    connect: {
                      id: user1.id,
                    },
                  },
                  isAdmin: true,
                },
              },
            },
          },
        },
      },
    },
  });

await indexDocument('organization', org1Id);
await Promise.all(
  org1Associations.map(({ channel }) => indexDocument('channel', channel.id)),
);

const { id: org2Id, associations: org2Associations } =
  await prisma.organization.create({
    include: {
      associations: { include: { channel: { select: { id: true } } } },
    },
    data: {
      name: 'Organization 3',
      slug: 'org3',
      memberships: {
        create: {
          appUser: {
            connect: {
              id: user2.id,
            },
          },
          isAdmin: true,
        },
      },
      associations: {
        create: {
          channel: {
            create: {
              name: 'Channel 3',
              slug: 'ch3',
              memberships: {
                create: {
                  appUser: {
                    connect: {
                      id: user2.id,
                    },
                  },
                  isAdmin: true,
                },
              },
            },
          },
        },
      },
    },
  });

await indexDocument('organization', org2Id);
await Promise.all(
  org2Associations.map(({ channel }) => indexDocument('channel', channel.id)),
);

for (let i = 0; i < 46; i += 1) {
  const name = `${faker.helpers.arrayElement([
    'Second Baptist',
    'Covenant',
    'Redeemer',
    'Covenant Presbyterian',
    'Redeemer Presbyterian',
    'Grace Fellowship Assembly',
  ])} Church ${faker.address.cityName()}`.trim();

  const { id } = await prisma.organization.create({
    data: {
      name,
      slug: slugify(name),
      memberships: {
        create: {
          appUser: {
            connect: {
              id: faker.helpers.arrayElement(otherIds),
            },
          },
          isAdmin: true,
        },
      },
    },
  });

  await indexDocument('organization', id);
}

console.log('Created example organizations and channels');

console.log('Seeding The Dorean Principle');

const baseUploadRecord = {
  appUserId: adminUser.id,
  channelId: (
    await prisma.channel.findUniqueOrThrow({
      select: { id: true },
      where: { slug: 'firstlove' },
    })
  ).id,
  uploadFinalized: true,
  uploadFinalizedById: adminUser.id,
  license: 'CC0' as const,
  visibility: 'PUBLIC' as const,
  variants: ['AUDIO'],
  transcodingFinishedAt: new Date(),
  transcribingFinishedAt: new Date(),
} satisfies Prisma.UploadRecordCreateManyInput;

const uploadRecordData = [
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000000',
    title: 'Foreword',
    uploadSizeBytes: 2986193,
    lengthSeconds: 186.566531,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Introduction',
    uploadSizeBytes: 3272913,
    lengthSeconds: 204.486531,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000002',
    title: 'Chapter 1 - The Command of Christ',
    uploadSizeBytes: 22962385,
    lengthSeconds: 1435.08898,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000003',
    title: 'Chapter 2 - The Policy of Paul',
    uploadSizeBytes: 17471697,
    lengthSeconds: 1091.918367,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000004',
    title: 'Chapter 3 - The Triangle of Obligation',
    uploadSizeBytes: 17115345,
    lengthSeconds: 1069.708367,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000005',
    title: 'Chapter 4 - The Burden of Support',
    uploadSizeBytes: 16812241,
    lengthSeconds: 1050.763061,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000006',
    title: 'Chapter 5 - The Preogative of Servanthood',
    uploadSizeBytes: 19398865,
    lengthSeconds: 1212.430612,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000007',
    title: 'Chapter 6 - The Sincerity of Ministry',
    uploadSizeBytes: 16396497,
    lengthSeconds: 1024.786531,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000008',
    title: 'Chapter 7 - The Greed of Wolves',
    uploadSizeBytes: 19323089,
    lengthSeconds: 1207.640816,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000009',
    title: 'Chapter 8 - The Apostles of Corinth',
    uploadSizeBytes: 17832145,
    lengthSeconds: 1114.357551,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000A',
    title: 'Chapter 9 - The Pattern of Colabor',
    uploadSizeBytes: 18325713,
    lengthSeconds: 1145.260408,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000B',
    title: 'Chapter 10 - The Testimony of History',
    uploadSizeBytes: 16933073,
    lengthSeconds: 1058.220408,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000C',
    title: 'Chapter 11 - The Scope of Ministry',
    uploadSizeBytes: 17428689,
    lengthSeconds: 1089.253878,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000D',
    title: 'Chapter 12 - The Challenge of Parachurch',
    uploadSizeBytes: 16756945,
    lengthSeconds: 1047.308571,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000E',
    title: 'Chapter 13 - The Issue of Copyright',
    uploadSizeBytes: 18176209,
    lengthSeconds: 1135.908571,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000F',
    title: 'Chapter 14 - The Path of Progress',
    uploadSizeBytes: 16425169,
    lengthSeconds: 1026.45551,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000010',
    title: 'Conclusion',
    uploadSizeBytes: 1954713,
    lengthSeconds: 121.939592,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000011',
    title: 'Appendix A - Further Study',
    uploadSizeBytes: 1343046,
    lengthSeconds: 83.748571,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000012',
    title: 'Appendix B - Copyright in the United States',
    uploadSizeBytes: 3256996,
    lengthSeconds: 140.355918,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000013',
    title: 'Appendix C - Copyright and Natural Law',
    uploadSizeBytes: 6713553,
    lengthSeconds: 419.526531,
  },
] satisfies Array<Prisma.UploadRecordCreateManyInput>;

await prisma.uploadRecord.createMany({
  data: uploadRecordData,
});

const series = await prisma.uploadList.create({
  select: {
    id: true,
  },
  data: {
    id: '00000000-0000-4000-8000-000000000000',
    title: 'The Dorean Principle',
    type: UploadListType.SERIES,
    author: {
      connect: {
        id: adminUser.id,
      },
    },
  },
});

let nextRank: string = LexoRank.middle().toString();

for (const { id } of uploadRecordData) {
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
  await indexDocument('transcript', id, `${id}/transcript.vtt`);
  await indexDocument('upload', id);
}
