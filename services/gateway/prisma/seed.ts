import { faker } from '@faker-js/faker';
import envariant from '@knpwrs/envariant';
import slugify from '@sindresorhus/slugify';
import waitOn from 'wait-on';
import argon2 from 'argon2';
import { indexDocument } from '../src/temporal';
import prisma from '../src/util/prisma';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

faker.seed(1337);

await waitOn({
  resources: [`tcp:${TEMPORAL_ADDRESS}`],
});

const password = await argon2.hash('password', { type: argon2.argon2id });

await prisma.appUser.createMany({
  data: [
    {
      email: 'admin@lets.church',
      username: 'admin',
      password,
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
