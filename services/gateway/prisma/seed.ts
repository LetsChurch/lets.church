import { faker } from '@faker-js/faker';
import envariant from '@knpwrs/envariant';
import slugify from '@sindresorhus/slugify';
import waitOn from 'wait-on';
import { indexDocument } from '../src/temporal';
import prisma from '../src/util/prisma';

const ORY_KRATOS_ADMIN_URL = envariant('ORY_KRATOS_ADMIN_URL');
const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

faker.seed(1337);

function collateUsers(
  users: Array<{ id: string; traits: { username: string } }>,
) {
  let user1Id;
  let user2Id;
  let adminId;
  const otherIds = [];

  for (const user of users) {
    if (user.traits.username === 'admin') {
      adminId = user.id;
    } else if (user.traits.username === 'user1') {
      user1Id = user.id;
    } else if (user.traits.username === 'user2') {
      user2Id = user.id;
    } else {
      otherIds.push(user.id);
    }
  }

  if (!user1Id || !user2Id || !adminId) {
    throw new Error('Missing expected data');
  }

  return { user1Id, user2Id, adminId, otherIds };
}

await waitOn({
  resources: [`tcp:${TEMPORAL_ADDRESS}`],
});

const oryRes = await fetch(`${ORY_KRATOS_ADMIN_URL}/identities`);
const oryIdents = await oryRes.json();
const usersRes = await prisma.appUser.createMany({
  data: oryIdents.map(
    (o: { id: string; metadata_public: { role: 'admin' | 'user' } }) => ({
      id: o.id,
    }),
  ),
  skipDuplicates: true,
});

console.log(`Synced ${usersRes.count} users`);

const { adminId, user1Id, user2Id, otherIds } = collateUsers(oryIdents);
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
