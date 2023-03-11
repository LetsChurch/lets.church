import { faker } from '@faker-js/faker';
import slugify from '@sindresorhus/slugify';
import argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { indexDocument, waitOnTemporal } from '../src/temporal';
import prisma from '../src/util/prisma';

faker.seed(1337);

await waitOnTemporal();

const password = await argon2.hash('password', { type: argon2.argon2id });

await prisma.appUser.createMany({
  data: [
    {
      email: 'admin@lets.church',
      username: 'admin',
      password,
      role: 'ADMIN',
    },
    {
      email: 'user1@example.org',
      username: 'user1',
      fullName: 'User One',
      password,
    },
    {
      email: 'user2@example.org',
      username: 'user2',
      fullName: 'User Two',
      password,
    },
    ...Array(47)
      .fill(null)
      .map(() => {
        const firstName = faker.name.firstName();
        const lastName = faker.name.lastName();
        return {
          email: faker.internet.email(firstName, lastName),
          username: faker.internet
            .userName(firstName, lastName)
            .replace(/[^a-zA-Z0-9_-]/g, '_'),
          fullName: `${firstName} ${lastName}`,
          password,
        };
      }),
  ],
  skipDuplicates: true,
});

const { id: adminId } = await prisma.appUser.findUniqueOrThrow({
  where: { username: 'admin' },
});
const { id: user1Id } = await prisma.appUser.findUniqueOrThrow({
  where: { username: 'user1' },
});
const { id: user2Id } = await prisma.appUser.findUniqueOrThrow({
  where: { username: 'user2' },
});
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
              id: adminId,
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
                      id: adminId,
                    },
                  },
                  isAdmin: true,
                },
              },
              subscribers: {
                create: {
                  appUser: {
                    connect: {
                      id: adminId,
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
await Promise.all(
  lcAssociations.map(({ channel }) => indexDocument('channel', channel.id)),
);

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
              id: user1Id,
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
                      id: user1Id,
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
      name: 'Organization 2',
      slug: 'org2',
      memberships: {
        create: {
          appUser: {
            connect: {
              id: user2Id,
            },
          },
          isAdmin: true,
        },
      },
      associations: {
        create: {
          channel: {
            create: {
              name: 'Channel 2',
              slug: 'ch2',
              memberships: {
                create: {
                  appUser: {
                    connect: {
                      id: user2Id,
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

for (let i = 0; i < 47; i += 1) {
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
  appUserId: adminId,
  channelId: (
    await prisma.channel.findUniqueOrThrow({
      select: { id: true },
      where: { slug: 'letschurch' },
    })
  ).id,
  uploadFinalized: true,
  uploadFinalizedById: adminId,
  license: 'CC0' as const,
  visibility: 'PUBLIC' as const,
  variants: ['AUDIO'],
} satisfies Prisma.UploadRecordCreateManyInput;

const uploadRecordData = [
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000000',
    title: 'Foreword',
    uploadSizeBytes: 2986193,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Introduction',
    uploadSizeBytes: 3272913,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000002',
    title: 'Chapter 1 - The Command of Christ',
    uploadSizeBytes: 22962385,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000003',
    title: 'Chapter 2 - The Policy of Paul',
    uploadSizeBytes: 17471697,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000004',
    title: 'Chapter 3 - The Triangle of Obligation',
    uploadSizeBytes: 17115345,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000005',
    title: 'Chapter 4 - The Burden of Support',
    uploadSizeBytes: 16812241,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000006',
    title: 'Chapter 5 - The Preogative of Servanthood',
    uploadSizeBytes: 19398865,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000007',
    title: 'Chapter 6 - The Sincerity of Ministry',
    uploadSizeBytes: 16396497,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000008',
    title: 'Chapter 7 - The Greed of Wolves',
    uploadSizeBytes: 19323089,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000009',
    title: 'Chapter 8 - The Apostles of Corinth',
    uploadSizeBytes: 17832145,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000A',
    title: 'Chapter 9 - The Pattern of Colabor',
    uploadSizeBytes: 18325713,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000B',
    title: 'Chapter 10 - The Testimony of History',
    uploadSizeBytes: 16933073,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000C',
    title: 'Chapter 11 - The Scope of Ministry',
    uploadSizeBytes: 17428689,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000D',
    title: 'Chapter 12 - The Challenge of Parachurch',
    uploadSizeBytes: 16756945,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000E',
    title: 'Chapter 13 - The Issue of Copyright',
    uploadSizeBytes: 18176209,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000F',
    title: 'Chapter 14 - The Path of Progress',
    uploadSizeBytes: 16425169,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000010',
    title: 'Conclusion',
    uploadSizeBytes: 1954713,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000011',
    title: 'Appendix A - Further Study',
    uploadSizeBytes: 1343046,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000012',
    title: 'Appendix B - Copyright in the United States',
    uploadSizeBytes: 3256996,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000013',
    title: 'Appendix C - Copyright and Natural Law',
    uploadSizeBytes: 6713553,
  },
] satisfies Array<Prisma.UploadRecordCreateManyInput>;

await prisma.uploadRecord.createMany({
  data: uploadRecordData,
});

for (const { id } of uploadRecordData) {
  await indexDocument('transcript', id, `${id}.vtt`);
  await indexDocument('upload', id);
}
