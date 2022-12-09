import { faker } from '@faker-js/faker';
import slugify from '@sindresorhus/slugify';
import argon2 from 'argon2';
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

await prisma.organization.create({
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
          },
        },
      },
    },
  },
});

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
};

await prisma.uploadRecord.createMany({
  data: [
    {
      ...baseUploadRecord,
      id: '41467e1c-707f-4739-8501-9cc9e8d4fcde',
      title: 'Foreword',
      uploadSizeBytes: 2986193,
    },
    {
      ...baseUploadRecord,
      id: '4d8efd7c-1fdb-4115-ba2e-c30cec15beb3',
      title: 'Introduction',
      uploadSizeBytes: 3272913,
    },
    {
      ...baseUploadRecord,
      id: 'a3bd53e3-9b62-4f1b-be6a-6d12acf83586',
      title: 'Chapter 1 - The Command of Christ',
      uploadSizeBytes: 22962385,
    },
    {
      ...baseUploadRecord,
      id: 'ff43a6a1-cf3e-43e1-af59-9286bdd747db',
      title: 'Chapter 2 - The Policy of Paul',
      uploadSizeBytes: 17471697,
    },
    {
      ...baseUploadRecord,
      id: 'e36341f0-6caf-4555-ab66-f1991670b467',
      title: 'Chapter 3 - The Triangle of Obligation',
      uploadSizeBytes: 17115345,
    },
    {
      ...baseUploadRecord,
      id: '0b15ed47-d04b-43d1-ad40-44dbbbe2c965',
      title: 'Chapter 4 - The Burden of Support',
      uploadSizeBytes: 16812241,
    },
    {
      ...baseUploadRecord,
      id: '780008c3-2667-4fd1-91cb-45cae4495e64',
      title: 'Chapter 5 - The Preogative of Servanthood',
      uploadSizeBytes: 19398865,
    },
    {
      ...baseUploadRecord,
      id: 'e7f2052c-09bf-4057-9405-aea468e3d719',
      title: 'Chapter 6 - The Sincerity of Ministry',
      uploadSizeBytes: 16396497,
    },
    {
      ...baseUploadRecord,
      id: 'c2aa79d4-d704-47b4-86da-84537e6a7316',
      title: 'Chapter 7 - The Greed of Wolves',
      uploadSizeBytes: 19323089,
    },
    {
      ...baseUploadRecord,
      id: '12e03224-152b-4336-8257-774468514e87',
      title: 'Chapter 8 - The Apostles of Corinth',
      uploadSizeBytes: 17832145,
    },
    {
      ...baseUploadRecord,
      id: '56a311fa-09fd-4e43-9f75-2ea2c0326f2b',
      title: 'Chapter 9 - The Pattern of Colabor',
      uploadSizeBytes: 18325713,
    },
    {
      ...baseUploadRecord,
      id: '1b27a048-7025-41f8-9625-a1c7f4021d37',
      title: 'Chapter 10 - The Testimony of History',
      uploadSizeBytes: 16933073,
    },
    {
      ...baseUploadRecord,
      id: 'c374406c-ca35-41e7-8c0c-ef8fe4691398',
      title: 'Chapter 11 - The Scope of Ministry',
      uploadSizeBytes: 17428689,
    },
    {
      ...baseUploadRecord,
      id: '1e804916-68e9-477c-ada9-4f88b82af64a',
      title: 'Chapter 12 - The Challenge of Parachurch',
      uploadSizeBytes: 16756945,
    },
    {
      ...baseUploadRecord,
      id: 'c11d7892-5c52-40df-8306-8b07866edd89',
      title: 'Chapter 13 - The Issue of Copyright',
      uploadSizeBytes: 18176209,
    },
    {
      ...baseUploadRecord,
      id: '0ec095d1-d9dd-4837-8f12-de2f4bb7d215',
      title: 'Chapter 14 - The Path of Progress',
      uploadSizeBytes: 16425169,
    },
    {
      ...baseUploadRecord,
      id: '0818882d-2c0e-496c-a985-85ebd9ec933a',
      title: 'Conclusion',
      uploadSizeBytes: 1954713,
    },
    {
      ...baseUploadRecord,
      id: '0a8ab5b4-a1ab-4331-9d4d-a9925ae14ff3',
      title: 'Appendix A - Further Study',
      uploadSizeBytes: 1343046,
    },
    {
      ...baseUploadRecord,
      id: 'df10c31f-bebf-4b8b-9aa8-2f70622cda2c',
      title: 'Appendix B - Copyright in the United States',
      uploadSizeBytes: 3256996,
    },
    {
      ...baseUploadRecord,
      id: '4393c351-0a6b-4263-b4b9-fd4cf177bb42',
      title: 'Appendix C - Copyright and Natural Law',
      uploadSizeBytes: 6713553,
    },
  ],
});
