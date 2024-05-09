import { faker } from '@faker-js/faker';
import parsePhoneNumber from 'libphonenumber-js';
import slugify from '@sindresorhus/slugify';
import argon2 from 'argon2';
import { Prisma, UploadListType } from '@prisma/client';
import invariant from 'tiny-invariant';
import { LexoRank } from 'lexorank';
import { indexDocument, waitOnTemporal } from '../../src/temporal';
import prisma from '../../src/util/prisma';
import logger from '../../src/util/logger';
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
import ppp from './geocoding/prosperitys-pitfall-pavilion';
import screwtape from './geocoding/screwtape-sanctuary';
import solas from './geocoding/solas-sanctuary';
import sovereignJoy from './geocoding/sovereign-joy-sanctuary';

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

await indexDocument('organization', org01id);
await Promise.all(
  org01Associations.map(({ channel }) => indexDocument('channel', channel.id)),
);

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

await indexDocument('organization', org03Id);
await Promise.all(
  org03Associations.map(({ channel }) => indexDocument('channel', channel.id)),
);

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

await indexDocument('organization', org04.id);

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

await indexDocument('organization', org05.id);

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
        geocodingJson: desertDebaters,
      },
    },
    channelAssociations: {
      create: {
        officialChannel: true,
        channel: {
          create: {
            name: 'Paint Dries, Moss Cows',
            slug: 'pdmc',
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

await indexDocument('organization', org06.id);

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

await indexDocument('organization', org07.id);

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

await indexDocument('organization', org08.id);

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

await indexDocument('organization', org09.id);

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

await indexDocument('organization', org10.id);

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

await indexDocument('organization', org11.id);

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

await indexDocument('organization', org12.id);

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

await indexDocument('organization', org13.id);

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

await indexDocument('organization', org14.id);

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

await indexDocument('organization', org15.id);

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

await indexDocument('organization', org16.id);

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

  await indexDocument('organization', id);
}

await indexDocument('organization', lcId);

logger.info('Created example organizations and channels');

logger.info('Seeding The Dorean Principle');

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
    id: '00000000-0000-4000-8000-00000000000a',
    title: 'Chapter 9 - The Pattern of Colabor',
    uploadSizeBytes: 18325713,
    lengthSeconds: 1145.260408,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000b',
    title: 'Chapter 10 - The Testimony of History',
    uploadSizeBytes: 16933073,
    lengthSeconds: 1058.220408,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000c',
    title: 'Chapter 11 - The Scope of Ministry',
    uploadSizeBytes: 17428689,
    lengthSeconds: 1089.253878,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000d',
    title: 'Chapter 12 - The Challenge of Parachurch',
    uploadSizeBytes: 16756945,
    lengthSeconds: 1047.308571,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000e',
    title: 'Chapter 13 - The Issue of Copyright',
    uploadSizeBytes: 18176209,
    lengthSeconds: 1135.908571,
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000f',
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
