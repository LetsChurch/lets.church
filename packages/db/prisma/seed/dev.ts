import { faker } from '@faker-js/faker';
import parsePhoneNumber from 'libphonenumber-js';
import slugify from '@sindresorhus/slugify';
import argon2 from 'argon2';
import { Prisma, UploadListType } from '../../src/generated/prisma/client';
import { invariant } from 'es-toolkit';
import { stripIndent } from 'proper-tags';
import { prisma } from '../../src';
import {
  augsburgConfessionTagSlug,
  baptistTagSlug,
  calvinisticBaptistTagSlug,
  evangelicalFreeTagSlug,
  independentTagSlug,
  lutheranAalcTagSlug,
  lutheranTagSlug,
  presbyterianCrecTagSlug,
  presbyterianPcaTagSlug,
  presbyterianTagSlug,
  reformedBaptistTagSlug,
  reformedTagSlug,
} from './tags';
import baptistLa from './geocoding/baptist-la';
import desertDebaters from './geocoding/desert-debaters';
import gwgh from './geocoding/gwgh';
import bananarama from './geocoding/bananarama-bible-church';
import clapback from './geocoding/clapback-chapel';
import cotton from './geocoding/cottons-finger-lutheran-church';
import harbor from './geocoding/harbor-faith-tabernacle';
import mariners from './geocoding/mariners-metanoia-manor';
import mossCows from './geocoding/moss-cows';
import ppp from './geocoding/prosperitys-pitfall-pavilion';
import screwtape from './geocoding/screwtape-sanctuary';
import solas from './geocoding/solas-sanctuary';
import sovereignJoy from './geocoding/sovereign-joy-sanctuary';

faker.seed(1337);

// await waitOnTemporal();

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

const { id: lcId, channelAssociations: lcAssociations } =
  await prisma.organization.create({
    include: {
      channelAssociations: { include: { channel: { select: { id: true } } } },
    },
    data: {
      id: '00000000-0000-4000-8000-000000000000',
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
      channelAssociations: {
        create: {
          officialChannel: true,
          channel: {
            create: {
              name: "Let's Church",
              slug: 'letschurch',
              approvedAt: new Date(),
              approvedById: adminUser.id,
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

const { id: flId, channelAssociations: flAssociations } =
  await prisma.organization.create({
    include: {
      channelAssociations: { include: { channel: { select: { id: true } } } },
    },
    data: {
      name: 'FirstLove Publications',
      slug: 'firstlove',
      avatarPath: 'first-love-publications/avatar.png',
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
      channelAssociations: {
        create: {
          officialChannel: true,
          channel: {
            create: {
              name: 'FirstLove Publications',
              slug: 'firstlove',
              avatarPath: 'first-love-publications/avatar.png',
              approvedAt: new Date(),
              approvedById: adminUser.id,
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

// await indexDocument('organization', lcId);
// await indexDocument('organization', flId);

await Promise.all([
  // ...indexDocument('channel', channel.id)),
  // ...indexDocument('channel', channel.id)),
]);

const { id: org01id, channelAssociations: org01Associations } =
  await prisma.organization.create({
    include: {
      channelAssociations: { include: { channel: { select: { id: true } } } },
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
      automaticallyApproveOrganizationAssociations: true,
      channelAssociations: {
        create: {
          officialChannel: true,
          channel: {
            create: {
              name: 'Channel 1',
              slug: 'ch1',
              approvedAt: new Date(),
              approvedById: adminUser.id,
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

// await indexDocument('organization', org01id);
// await Promise.all(
//   org01Associations.map(({ channel }) => indexDocument('channel', channel.id)),
// );

const { id: org03Id, channelAssociations: org03Associations } =
  await prisma.organization.create({
    include: {
      channelAssociations: { include: { channel: { select: { id: true } } } },
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
      automaticallyApproveOrganizationAssociations: true,
      channelAssociations: {
        create: {
          officialChannel: true,
          channel: {
            create: {
              name: 'Channel 3',
              slug: 'ch3',
              approvedAt: new Date(),
              approvedById: adminUser.id,
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
      upstreamOrganizationAssociations: {
        create: {
          upstreamOrganization: { connect: { id: lcId } },
          upstreamApproved: true,
          downstreamApproved: true,
        },
      },
    },
  });

// await indexDocument('organization', org03Id);
// await Promise.all(
//   org03Associations.map(({ channel }) => indexDocument('channel', channel.id)),
// );

const org04 = await prisma.organization.create({
  data: {
    name: 'Baptist, But Not Too Baptist, Community Church',
    slug: 'baptist-la',
    description: 'We are a church that is baptist, but not too baptist.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: baptistTagSlug,
          },
          {
            tagSlug: calvinisticBaptistTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '13248 Roscoe Blvd, Sun Valley, CA 91352',
        country: 'United States',
        locality: 'Sun Valley',
        region: 'California',
        postalCode: '91352',
        streetAddress: '13248 Roscoe Boulevard',
        longitude: -118.422009,
        latitude: 34.220299,
        geocodingJson: baptistLa,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Baptist, But Not Too Baptist, Sermons',
            slug: 'baptist-la',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org04.id);

const org05 = await prisma.organization.create({
  data: {
    name: 'Desert Debaters Society',
    slug: 'desert-debaters',
    description: 'We are a church that is all about debating in the desert.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: baptistTagSlug,
          },
          {
            tagSlug: reformedBaptistTagSlug,
          },
          {
            tagSlug: reformedTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '717 N Stapley Dr Mesa AZ, 85203',
        country: 'United States',
        locality: 'Mesa',
        region: 'Arizona',
        postalCode: '85203',
        streetAddress: '717 North Stapley Drive',
        longitude: -111.804779,
        latitude: 33.428472,
        geocodingJson: desertDebaters,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Desert Debates',
            slug: 'desert-debates',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org05.id);

const org06 = await prisma.organization.create({
  data: {
    name: 'Moss Cows',
    slug: 'moss-cows',
    description: 'We are a church that is all about moss and all about cows.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: presbyterianTagSlug,
          },
          {
            tagSlug: presbyterianCrecTagSlug,
          },
          {
            tagSlug: reformedTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '417 S. Jackson St Moscow ID 83843',
        country: 'United States',
        locality: 'Moscow',
        region: 'Idaho',
        postalCode: '83843',
        streetAddress: '417 South Jackson Street',
        longitude: -117.003105,
        latitude: 46.731083,
        geocodingJson: mossCows,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Paint Dries, Moss Cows',
            slug: 'pdmc',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org06.id);

const org07 = await prisma.organization.create({
  data: {
    name: 'Gopher Wood Gospel Hall',
    slug: 'gwgh',
    description:
      'We are a church that is all about large structures made of gopher wood.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: independentTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '1 Ark Encounter Dr, Williamstown, KY 41097',
        country: 'United States',
        locality: 'Williamstown',
        region: 'Kentucky',
        postalCode: '41097',
        streetAddress: '1 Ark Encounter Drive',
        longitude: -84.580878,
        latitude: 38.628008,
        geocodingJson: gwgh,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: '40 Days',
            slug: '40days',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org07.id);

const org08 = await prisma.organization.create({
  data: {
    name: 'Bananarama Bible Church',
    slug: 'banana',
    description:
      'We are a church that is all about bananas and all about the Bible.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: independentTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '9818 Arkansas Street, Bellflower, California 90706',
        country: 'United States',
        locality: 'Bellflower',
        region: 'California',
        postalCode: '90706',
        streetAddress: '9818 Arkansas Street',
        longitude: -118.124494,
        latitude: 33.879147,
        geocodingJson: bananarama,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Potassium Carb Sticks',
            slug: 'pc-sticks',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org08.id);

const org09 = await prisma.organization.create({
  data: {
    name: "Cotton's Finger Lutheran Church",
    slug: 'cotton',
    description: 'We are a church that is all about baumwollfinger.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: augsburgConfessionTagSlug,
          },
          {
            tagSlug: lutheranTagSlug,
          },
          {
            tagSlug: lutheranAalcTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '15950 County Highway 22, Oslo, Minnesota 56744',
        country: 'United States',
        locality: 'Oslo',
        region: 'Minesota',
        postalCode: '56744',
        streetAddress: null,
        longitude: -97.063182,
        latitude: 48.107127,
        geocodingJson: cotton,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'T-Shirts and Theology',
            slug: 't-shirts-and-theology',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org09.id);

const org10 = await prisma.organization.create({
  data: {
    name: 'Harbor Faith Tabernacle',
    description:
      'We are a church that is all about harbors and #superiortheology.',
    slug: 'harbor',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: baptistTagSlug,
          },
          {
            tagSlug: reformedBaptistTagSlug,
          },
          {
            tagSlug: reformedTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '13773 Main Street, Jacksonville, Florida 32218',
        country: 'United States',
        locality: 'Jacksonville',
        region: 'Florida',
        postalCode: '32218',
        streetAddress: null,
        longitude: -81.625352,
        latitude: 30.486745,
        geocodingJson: harbor,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Harbor Faith Tabernacle Sermons',
            slug: 'harbor-faith',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org10.id);

const org11 = await prisma.organization.create({
  data: {
    name: 'Mariners Metanoia Manor',
    slug: 'mariners',
    description:
      'We are a church that is all about ships that change direction.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: baptistTagSlug,
          },
          {
            tagSlug: reformedBaptistTagSlug,
          },
          {
            tagSlug: reformedTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '1076 Harkrider Street, Conway, Arkansas 72032',
        country: 'United States',
        locality: 'Conway',
        region: 'Arkansas',
        postalCode: '72032',
        streetAddress: null,
        longitude: -92.436278,
        latitude: 35.093419,
        geocodingJson: mariners,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'About Face',
            slug: 'about-face',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org11.id);

const org12 = await prisma.organization.create({
  data: {
    name: "Prosperity's Pitfall Pavilion",
    description:
      'We are a church where you will learn about the pitfalls of the prosperity gospel, which is not a gospel.',
    slug: 'ppp',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: baptistTagSlug,
          },
          {
            tagSlug: calvinisticBaptistTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '477 North Main Street, Kootenai, Idaho 83840',
        country: 'United States',
        locality: 'Kootenai',
        region: 'Idaho',
        postalCode: '83840',
        streetAddress: null,
        longitude: -116.51474,
        latitude: 48.31366,
        geocodingJson: ppp,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Kootny',
            slug: 'kootny',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org12.id);

const org13 = await prisma.organization.create({
  data: {
    name: 'Screwtape Sanctuary',
    slug: 'screwtape',
    description: 'We like C.S. Lewis.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: presbyterianPcaTagSlug,
          },
          {
            tagSlug: presbyterianTagSlug,
          },
          {
            tagSlug: reformedTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '150 West 83rd Street, New York, New York 10024',
        country: 'United States',
        locality: 'New York',
        region: 'New York',
        postalCode: '10024',
        streetAddress: null,
        longitude: -73.975655,
        latitude: 40.785179,
        geocodingJson: screwtape,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Screwtape Sermons',
            slug: 'screwtape',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org13.id);

const org14 = await prisma.organization.create({
  data: {
    name: 'Solas Sanctuary',
    slug: 'solas',
    description: 'We are a church that is all about the five solas.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: presbyterianTagSlug,
          },
          {
            tagSlug: reformedTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '5525 Wayside Drive, Sanford, Florida 32771',
        country: 'United States',
        locality: 'Sanford',
        region: 'Florida',
        postalCode: '32771',
        streetAddress: null,
        longitude: -81.358549,
        latitude: 28.807633,
        geocodingJson: solas,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Grace Sermons',
            slug: 'grace',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org14.id);

const org15 = await prisma.organization.create({
  data: {
    name: 'Sovereign Joy Sanctuary',
    slug: 'sovereign-joy',
    description:
      'We are a church that is all about the sovereignty of God and the joy of the saints.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: baptistTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: '720 13th Avenue South, Minneapolis, Minnesota 55415',
        country: 'United States',
        locality: 'Minneapolis',
        region: 'Minnesota',
        postalCode: '55415',
        streetAddress: null,
        longitude: -93.255447,
        latitude: 44.968956,
        geocodingJson: sovereignJoy,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Happy Sermons',
            slug: 'happy',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org15.id);

const org16 = await prisma.organization.create({
  data: {
    name: 'Clapback Chapel',
    slug: 'clapback',
    description:
      'We are a church that is all about clapping back at the world.',
    type: 'CHURCH',
    tags: {
      createMany: {
        data: [
          {
            tagSlug: baptistTagSlug,
          },
        ],
      },
    },
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    addresses: {
      create: {
        type: 'MEETING',
        query: 'Roanoke, Virginia, United States',
        country: 'United States',
        locality: 'Roanoke',
        region: 'Virginia',
        postalCode: null,
        streetAddress: null,
        longitude: -79.941431,
        latitude: 37.270973,
        geocodingJson: clapback,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Clapback Sermons',
            slug: 'clapback',
            approvedAt: new Date(),
            approvedById: adminUser.id,
          },
        },
      },
    },
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
    upstreamOrganizationAssociations: {
      create: {
        upstreamOrganization: { connect: { id: lcId } },
        upstreamApproved: true,
        downstreamApproved: true,
      },
    },
  },
});

// await indexDocument('organization', org16.id);

const sellingJesusChannel = await prisma.channel.create({
  data: {
    name: 'Selling Jesus',
    slug: 'selling-jesus',
    description:
      'Selling Jesus is a ministry that seeks to expose the commercialization of Christianity.',
    avatarPath: 'selling-jesus/avatar.jpg',
    approvedAt: new Date(),
    approvedById: adminUser.id,
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
});

// await indexDocument('channel', sellingJesusChannel.id);

for (let i = 0; i < 25; i += 1) {
  const [nameSegment, denomination] = faker.helpers.arrayElement<
    [string, Array<string>]
  >([
    ['Second Baptist', [baptistTagSlug]],
    ['Covenant', [reformedTagSlug, baptistTagSlug, reformedBaptistTagSlug]],
    ['Redeemer', [evangelicalFreeTagSlug]],
    ['Covenant Presbyterian', [reformedTagSlug, presbyterianTagSlug]],
    ['Redeemer Presbyterian', [reformedTagSlug, presbyterianTagSlug]],
    ['Grace Fellowship Assembly', [independentTagSlug]],
  ]);

  const name = `${nameSegment} Church ${faker.location.city()}`.trim();

  const { id } = await prisma.organization.create({
    data: {
      name,
      slug: slugify(name),
      description: faker.lorem.paragraph(),
      type: 'CHURCH',
      tags: {
        createMany: {
          data: denomination.map((tagSlug) => ({ tagSlug })),
        },
      },
      primaryEmail: faker.internet.email(),
      primaryPhoneNumber:
        parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
      websiteUrl: faker.internet.url(),
      addresses: {
        create: {
          type: 'MEETING',
          latitude: faker.location.latitude({
            min: 31.915916,
            max: 49.4515636581924,
          }),
          longitude: faker.location.longitude({
            min: -111.878045,
            max: -84.2539813003493,
          }),
        },
      },
      channelAssociations: {
        create: {
          officialChannel: true,
          channel: {
            create: {
              name: faker.internet.domainWord(),
              slug: faker.internet.domainWord(),
              approvedAt: new Date(),
              approvedById: adminUser.id,
            },
          },
        },
      },
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

  // await indexDocument('organization', id);
}

// await indexDocument('organization', lcId);

// logger.info('Created example organizations and channels');

// logger.info('Seeding The Dorean Principle');

const firstLoveChannelId = (
  await prisma.channel.findUniqueOrThrow({
    select: { id: true },
    where: { slug: 'firstlove' },
  })
).id;

const baseUploadRecord = {
  appUserId: adminUser.id,
  channelId: firstLoveChannelId,
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
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Introduction',
    uploadSizeBytes: 3272913,
    lengthSeconds: 204.486531,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000001.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000002',
    title: 'Chapter 1 - The Command of Christ',
    uploadSizeBytes: 22962385,
    lengthSeconds: 1435.08898,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000002.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000003',
    title: 'Chapter 2 - The Policy of Paul',
    uploadSizeBytes: 17471697,
    lengthSeconds: 1091.918367,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000003/00000000-0000-4000-8000-000000000003.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000004',
    title: 'Chapter 3 - The Triangle of Obligation',
    uploadSizeBytes: 17115345,
    lengthSeconds: 1069.708367,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000004/00000000-0000-4000-8000-000000000004.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000005',
    title: 'Chapter 4 - The Burden of Support',
    uploadSizeBytes: 16812241,
    lengthSeconds: 1050.763061,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000005/00000000-0000-4000-8000-000000000005.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000006',
    title: 'Chapter 5 - The Preogative of Servanthood',
    uploadSizeBytes: 19398865,
    lengthSeconds: 1212.430612,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000006/00000000-0000-4000-8000-000000000006.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000007',
    title: 'Chapter 6 - The Sincerity of Ministry',
    uploadSizeBytes: 16396497,
    lengthSeconds: 1024.786531,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000007/00000000-0000-4000-8000-000000000007.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000008',
    title: 'Chapter 7 - The Greed of Wolves',
    uploadSizeBytes: 19323089,
    lengthSeconds: 1207.640816,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000008/00000000-0000-4000-8000-000000000008.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000009',
    title: 'Chapter 8 - The Apostles of Corinth',
    uploadSizeBytes: 17832145,
    lengthSeconds: 1114.357551,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000009/00000000-0000-4000-8000-000000000009.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000a',
    title: 'Chapter 9 - The Pattern of Colabor',
    uploadSizeBytes: 18325713,
    lengthSeconds: 1145.260408,
    defaultThumbnailPath: '00000000-0000-4000-8000-00000000000a/00000000-0000-4000-8000-00000000000a.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000b',
    title: 'Chapter 10 - The Testimony of History',
    uploadSizeBytes: 16933073,
    lengthSeconds: 1058.220408,
    defaultThumbnailPath: '00000000-0000-4000-8000-00000000000b/00000000-0000-4000-8000-00000000000b.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000c',
    title: 'Chapter 11 - The Scope of Ministry',
    uploadSizeBytes: 17428689,
    lengthSeconds: 1089.253878,
    defaultThumbnailPath: '00000000-0000-4000-8000-00000000000c/00000000-0000-4000-8000-00000000000c.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000d',
    title: 'Chapter 12 - The Challenge of Parachurch',
    uploadSizeBytes: 16756945,
    lengthSeconds: 1047.308571,
    defaultThumbnailPath: '00000000-0000-4000-8000-00000000000d/00000000-0000-4000-8000-00000000000d.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000e',
    title: 'Chapter 13 - The Issue of Copyright',
    uploadSizeBytes: 18176209,
    lengthSeconds: 1135.908571,
    defaultThumbnailPath: '00000000-0000-4000-8000-00000000000e/00000000-0000-4000-8000-00000000000e.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000f',
    title: 'Chapter 14 - The Path of Progress',
    uploadSizeBytes: 16425169,
    lengthSeconds: 1026.45551,
    defaultThumbnailPath: '00000000-0000-4000-8000-00000000000f/00000000-0000-4000-8000-00000000000f.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000010',
    title: 'Conclusion',
    uploadSizeBytes: 1954713,
    lengthSeconds: 121.939592,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000010/00000000-0000-4000-8000-000000000010.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000011',
    title: 'Appendix A - Further Study',
    uploadSizeBytes: 1343046,
    lengthSeconds: 83.748571,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000011/00000000-0000-4000-8000-000000000011.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000012',
    title: 'Appendix B - Copyright in the United States',
    uploadSizeBytes: 3256996,
    lengthSeconds: 140.355918,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000012/00000000-0000-4000-8000-000000000012.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000013',
    title: 'Appendix C - Copyright and Natural Law',
    uploadSizeBytes: 6713553,
    lengthSeconds: 419.526531,
    defaultThumbnailPath: '00000000-0000-4000-8000-000000000013/00000000-0000-4000-8000-000000000013.png',
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

let nextRank = 0;

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

  nextRank += 1;

  // await indexDocument('transcript', id, `${id}/transcript.vtt`);
  // await indexDocument('upload', id);
}

// logger.info('Seeding Selling Jesus');

const doreanPrincipleUploadId = '00000000-0000-4000-8000-100000000000';

await prisma.uploadRecord.create({
  data: {
    id: doreanPrincipleUploadId,
    title: 'The Dorean Principle in Five Minutes',
    description: stripIndent`
      What things are too sacred to be sold? Should Christian ministers ever charge money for things like worship music, preaching, teaching, or counseling?

      This is a quick, broad overview of a simple biblical teaching: accepting support as anything other than an act of co-labor compromises the sincerity of Christian ministry.

      Ministry should be supported but never sold.

      For a more thorough explanation of what is covered in this video, please read or listen to the free book, The Dorean Principle: https://thedoreanprinciple.org/
    `,
    appUserId: adminUser.id,
    channelId: sellingJesusChannel.id,
    uploadFinalized: true,
    uploadFinalizedById: adminUser.id,
    license: 'CC0' as const,
    visibility: 'PUBLIC' as const,
    variants: ['AUDIO', 'VIDEO_1080P'],
    transcodingFinishedAt: new Date(),
    transcribingFinishedAt: new Date(),
    uploadSizeBytes: 180000000, // Approximate based on file sizes
    lengthSeconds: 328.26,
    defaultThumbnailPath: `${doreanPrincipleUploadId}/${doreanPrincipleUploadId}.jpg`,
  },
});

// await indexDocument('transcript', doreanPrincipleUploadId, `${doreanPrincipleUploadId}/transcript.vtt`);
// await indexDocument('upload', doreanPrincipleUploadId);

const prayerPitchUploadId = '00000000-0000-4000-8000-100000000001';

await prisma.uploadRecord.create({
  data: {
    id: prayerPitchUploadId,
    title: 'Prayer Pitch Meeting - 1',
    description: stripIndent`
      Step inside the pitch meeting that led to the commercialization of prayer! Learn from these masterminds of ministry monetization, and see how you too can begin cashing in on people's need for intercession.

      Please consider learning more at:

      https://sellingjesus.org/
      https://thedoreanprinciple.org/
      https://copy.church/

      The pitch meeting format is inspired by Ryan George.
    `,
    appUserId: adminUser.id,
    channelId: sellingJesusChannel.id,
    uploadFinalized: true,
    uploadFinalizedById: adminUser.id,
    license: 'CC0' as const,
    visibility: 'PUBLIC' as const,
    variants: ['AUDIO', 'VIDEO_720P'],
    transcodingFinishedAt: new Date(),
    transcribingFinishedAt: new Date(),
    uploadSizeBytes: 63000000, // Approximate based on file sizes
    lengthSeconds: 327.88391,
    defaultThumbnailPath: `${prayerPitchUploadId}/${prayerPitchUploadId}.jpg`,
  },
});

// await indexDocument('transcript', prayerPitchUploadId, `${prayerPitchUploadId}/transcript.vtt`);
// await indexDocument('upload', prayerPitchUploadId);

const christianBooksPitchUploadId = '00000000-0000-4000-8000-100000000002';

await prisma.uploadRecord.create({
  data: {
    id: christianBooksPitchUploadId,
    title: 'Christian Books Pitch Meeting - 2',
    description: stripIndent`
      Step inside the pitch meeting that led to the commercialization of Christian books! Learn from these masterminds of ministry monetization, and see how you too can begin cashing in on people's need to grow in the knowledge of the truth.

      Please consider learning more at:

      https://sellingjesus.org/
      https://thedoreanprinciple.org/
      https://copy.church/

      The pitch meeting format is inspired by Ryan George.
    `,
    appUserId: adminUser.id,
    channelId: sellingJesusChannel.id,
    uploadFinalized: true,
    uploadFinalizedById: adminUser.id,
    license: 'CC0' as const,
    visibility: 'PUBLIC' as const,
    variants: ['AUDIO', 'VIDEO_720P'],
    transcodingFinishedAt: new Date(),
    transcribingFinishedAt: new Date(),
    uploadSizeBytes: 63000000, // Approximate based on file sizes
    lengthSeconds: 552.199981,
    defaultThumbnailPath: `${christianBooksPitchUploadId}/${christianBooksPitchUploadId}.jpg`,
  },
});

// await indexDocument('transcript', christianBooksPitchUploadId, `${christianBooksPitchUploadId}/transcript.vtt`);
// await indexDocument('upload', christianBooksPitchUploadId);

const foreignMissionsUploadId = '00000000-0000-4000-8000-100000000003';

await prisma.uploadRecord.create({
  data: {
    id: foreignMissionsUploadId,
    title: 'Foreign Missions Pitch Meeting - 3',
    description: stripIndent`
      Step inside the pitch meeting that led to the commercialization of foreign missions! Learn from these masterminds of ministry monetization, and see how you too can begin cashing in on people's need for the gospel.

      Please consider learning more at:

      https://sellingjesus.org/
      https://thedoreanprinciple.org/
      https://copy.church/

      The pitch meeting format is inspired by Ryan George.
    `,
    appUserId: adminUser.id,
    channelId: sellingJesusChannel.id,
    uploadFinalized: true,
    uploadFinalizedById: adminUser.id,
    license: 'CC0' as const,
    visibility: 'PUBLIC' as const,
    variants: ['AUDIO', 'VIDEO_720P'],
    transcodingFinishedAt: new Date(),
    transcribingFinishedAt: new Date(),
    uploadSizeBytes: 177000000, // Approximate based on download size
    lengthSeconds: 477.034367,
    defaultThumbnailPath: `${foreignMissionsUploadId}/${foreignMissionsUploadId}.jpg`,
  },
});

// await indexDocument('transcript', foreignMissionsUploadId, `${foreignMissionsUploadId}/transcript.vtt`);
// await indexDocument('upload', foreignMissionsUploadId);

const copyrightUploadId = '00000000-0000-4000-8000-100000000004';

await prisma.uploadRecord.create({
  data: {
    id: copyrightUploadId,
    title: 'Copyright Pitch Meeting - 4',
    description: stripIndent`
      Step inside the pitch meeting that led to the copyrighting of Christian content! Learn from these masterminds of ministry monetization, and see how you too can commercialize access to Truth and undermine the gospel.

      Please consider learning more at:

      https://sellingjesus.org/
      https://thedoreanprinciple.org/
      https://copy.church/

      The pitch meeting format is inspired by Ryan George.
    `,
    appUserId: adminUser.id,
    channelId: sellingJesusChannel.id,
    uploadFinalized: true,
    uploadFinalizedById: adminUser.id,
    license: 'CC0' as const,
    visibility: 'PUBLIC' as const,
    variants: ['AUDIO', 'VIDEO_720P'],
    transcodingFinishedAt: new Date(),
    transcribingFinishedAt: new Date(),
    uploadSizeBytes: 162000000, // Approximate based on download size
    lengthSeconds: 429.769433,
    defaultThumbnailPath: `${copyrightUploadId}/${copyrightUploadId}.jpg`,
  },
});

// await indexDocument('transcript', copyrightUploadId, `${copyrightUploadId}/transcript.vtt`);
// await indexDocument('upload', copyrightUploadId);

const biblicalCounselingUploadId = '00000000-0000-4000-8000-100000000005';

await prisma.uploadRecord.create({
  data: {
    id: biblicalCounselingUploadId,
    title: 'Biblical Counseling Pitch Meeting - 5',
    description: stripIndent`
      Step inside the pitch meeting that led to the commercialization of biblical counseling! Learn from these masterminds of ministry monetization, and see how you too can begin cashing in on people's pain, confusion, and sin.

      Please consider learning more at:

      https://sellingjesus.org/
      https://thedoreanprinciple.org/
      https://copy.church/

      The pitch meeting format is inspired by Ryan George.
    `,
    appUserId: adminUser.id,
    channelId: sellingJesusChannel.id,
    uploadFinalized: true,
    uploadFinalizedById: adminUser.id,
    license: 'CC0' as const,
    visibility: 'PUBLIC' as const,
    variants: ['AUDIO', 'VIDEO_720P'],
    transcodingFinishedAt: new Date(),
    transcribingFinishedAt: new Date(),
    uploadSizeBytes: 168000000, // Approximate based on download size
    lengthSeconds: 377.673333,
    defaultThumbnailPath: `${biblicalCounselingUploadId}/${biblicalCounselingUploadId}.jpg`,
  },
});

// await indexDocument('transcript', biblicalCounselingUploadId, `${biblicalCounselingUploadId}/transcript.vtt`);
// await indexDocument('upload', biblicalCounselingUploadId);

const lordsSupperUploadId = '00000000-0000-4000-8000-100000000006';

await prisma.uploadRecord.create({
  data: {
    id: lordsSupperUploadId,
    title: "The Lord's Supper Pitch Meeting - 6",
    description: stripIndent`
      Step inside the pitch meeting that led to the commercialization of the Lord's Supper! Learn from these masterminds of ministry monetization, and see how you too can begin cashing in on the sacraments!

      Please consider learning more at:

      https://sellingjesus.org/
      https://thedoreanprinciple.org/
      https://copy.church/

      The pitch meeting format is inspired by Ryan George.
    `,
    appUserId: adminUser.id,
    channelId: sellingJesusChannel.id,
    uploadFinalized: true,
    uploadFinalizedById: adminUser.id,
    license: 'CC0' as const,
    visibility: 'PUBLIC' as const,
    variants: ['AUDIO' ,'VIDEO_720P'],
    transcodingFinishedAt: new Date(),
    transcribingFinishedAt: new Date(),
    uploadSizeBytes: 137000000, // Approximate based on download size
    lengthSeconds: 313.405400,
    defaultThumbnailPath: `${lordsSupperUploadId}/${lordsSupperUploadId}.jpg`,
  },
});

// await indexDocument('transcript', lordsSupperUploadId, `${lordsSupperUploadId}/transcript.vtt`);
// await indexDocument('upload', lordsSupperUploadId);

// logger.info('Seeding featured uploads');

const featuredUploadsData = [
  {
    uploadRecordId: '00000000-0000-4000-8000-000000000001', // Introduction from The Dorean Principle
    rank: 0,
  },
  {
    uploadRecordId: prayerPitchUploadId, // Prayer Pitch Meeting - 1
    rank: 1,
  },
  {
    uploadRecordId: foreignMissionsUploadId, // Foreign Missions Pitch Meeting - 3
    rank: 2,
  },
  {
    uploadRecordId: biblicalCounselingUploadId, // Biblical Counseling Pitch Meeting - 5
    rank: 3,
  },
  {
    uploadRecordId: '00000000-0000-4000-8000-000000000010', // Conclusion from The Dorean Principle
    rank: 4,
  },
] satisfies Array<Prisma.FeaturedUploadCreateManyInput>;

await prisma.featuredUpload.createMany({
  data: featuredUploadsData,
});

// logger.info('Featured uploads seeded successfully');
