import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import {
  Annotation,
  AppUser,
  AppUserEmail,
  Channel,
  ChannelMembership,
  ChannelSubscription,
  db,
  FeaturedUpload,
  Organization,
  OrganizationAddress,
  OrganizationChannelAssociation,
  OrganizationMembership,
  OrganizationOrganizationAssociation,
  OrganizationTagInstance,
  Speaker,
  SpeakerAttribution,
  TranscriptParagraph,
  UploadList,
  UploadListEntry,
  UploadRecord,
} from '@letschurch/db';
import storeTranscriptParagraphs from '@letschurch/temporal/activities/background/store-transcript-paragraphs';
import { client, indexDocument } from '@letschurch/temporal/client';
import { UPLOAD_ID_KEY } from '@letschurch/temporal/search-attributes';
import { makeSummarizeUploadWorkflowId } from '@letschurch/temporal/workflow-ids';
import { summarizeUploadWorkflow } from '@letschurch/temporal/workflows/background';
import slugify from '@sindresorhus/slugify';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { invariant } from 'es-toolkit';
import parsePhoneNumber from 'libphonenumber-js';
import { stripIndent } from 'proper-tags';
import bananarama from './geocoding/bananarama-bible-church';
import baptistLa from './geocoding/baptist-la';
import clapback from './geocoding/clapback-chapel';
import cotton from './geocoding/cottons-finger-lutheran-church';
import desertDebaters from './geocoding/desert-debaters';
import gwgh from './geocoding/gwgh';
import harbor from './geocoding/harbor-faith-tabernacle';
import mariners from './geocoding/mariners-metanoia-manor';
import mossCows from './geocoding/moss-cows';
import ppp from './geocoding/prosperitys-pitfall-pavilion';
import screwtape from './geocoding/screwtape-sanctuary';
import solas from './geocoding/solas-sanctuary';
import sovereignJoy from './geocoding/sovereign-joy-sanctuary';
import {
  LLM_SEED_DATA_DIR,
  LLM_SEEDED_UPLOAD_IDS,
  type LlmSeedSnapshot,
} from './llm-seed';
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

faker.seed(1337);

const [existingAdmin] = await db
  .select()
  .from(AppUser)
  .where(eq(AppUser.username, 'admin'))
  .limit(1);

if (existingAdmin) {
  console.log('Database already seeded, skipping.');
  process.exit(0);
}

const password = await argon2.hash('password', { type: argon2.argon2id });

// Create users
const [adminUser] = await db
  .insert(AppUser)
  .values({ username: 'admin', password, role: 'ADMIN', updatedAt: new Date() })
  .returning();
await db.insert(AppUserEmail).values({
  appUserId: adminUser?.id,
  email: 'admin@lets.church',
  verifiedAt: new Date(),
});

const [user1] = await db
  .insert(AppUser)
  .values({
    username: 'user1',
    fullName: 'User One',
    password,
    updatedAt: new Date(),
  })
  .returning();
await db.insert(AppUserEmail).values({
  appUserId: user1?.id,
  email: 'user1@example.org',
  verifiedAt: new Date(),
});

const [user2] = await db
  .insert(AppUser)
  .values({
    username: 'user2',
    fullName: 'User Two',
    password,
    updatedAt: new Date(),
  })
  .returning();
await db.insert(AppUserEmail).values({
  appUserId: user2?.id,
  email: 'user2@example.org',
  verifiedAt: new Date(),
});

const [user3] = await db
  .insert(AppUser)
  .values({
    username: 'user3',
    fullName: 'User Three',
    password,
    updatedAt: new Date(),
  })
  .returning();
await db.insert(AppUserEmail).values({
  appUserId: user3?.id,
  email: 'user3@example.org',
  verifiedAt: new Date(),
});

const [user4] = await db
  .insert(AppUser)
  .values({
    username: 'user4',
    fullName: 'User Four',
    password,
    updatedAt: new Date(),
  })
  .returning();
await db.insert(AppUserEmail).values({
  appUserId: user4?.id,
  email: 'user4@example.org',
  verifiedAt: new Date(),
});

const [user5] = await db
  .insert(AppUser)
  .values({
    username: 'user5',
    fullName: 'User Five',
    password,
    updatedAt: new Date(),
  })
  .returning();
await db.insert(AppUserEmail).values({
  appUserId: user5?.id,
  email: 'user5@example.org',
  verifiedAt: new Date(),
});

invariant(
  adminUser && user1 && user2,
  'Failed to create adminUser, user1, or user2',
);
invariant(user3 && user4 && user5, 'Failed to create user3, user4, or user5');

const otherIds = [user3.id, user4.id, user5.id];

// Create Let's Church organization and channel
const [lcOrg] = await db
  .insert(Organization)
  .values({
    id: '00000000-0000-4000-8000-000000000000',
    name: "Let's Church",
    slug: 'letschurch',
    approvedAt: new Date(),
    approvedById: adminUser.id,
    automaticallyApproveOrganizationAssociations: false,
    updatedAt: new Date(),
  })
  .returning();
const lcId = lcOrg?.id;

await db.insert(OrganizationMembership).values({
  organizationId: lcId,
  appUserId: adminUser.id,
  isAdmin: true,
  canEdit: true,
  updatedAt: new Date(),
});

const [lcChannel] = await db
  .insert(Channel)
  .values({
    name: "Let's Church",
    slug: 'letschurch',
    approvedAt: new Date(),
    approvedById: adminUser.id,
    updatedAt: new Date(),
  })
  .returning();

await db.insert(ChannelMembership).values({
  channelId: lcChannel?.id,
  appUserId: adminUser.id,
  isAdmin: true,
  canEdit: true,
  canDownload: true,
  updatedAt: new Date(),
});

await db.insert(ChannelSubscription).values({
  channelId: lcChannel?.id,
  appUserId: adminUser.id,
});

const [lcAssoc] = await db
  .insert(OrganizationChannelAssociation)
  .values({
    organizationId: lcId,
    channelId: lcChannel?.id,
    officialChannel: true,
    updatedAt: new Date(),
  })
  .returning();

const lcAssociations = [{ channel: { id: lcAssoc?.channelId } }];

await indexDocument('organization', lcId);

// Create The Dorean Principle organization and channel
const [flOrg] = await db
  .insert(Organization)
  .values({
    name: 'The Dorean Principle',
    slug: 'dorean',
    avatarPath: 'dorean-principle/avatar.png',
    approvedAt: new Date(),
    approvedById: adminUser.id,
    automaticallyApproveOrganizationAssociations: false,
    updatedAt: new Date(),
  })
  .returning();
const flId = flOrg?.id;

await db.insert(OrganizationMembership).values({
  organizationId: flId,
  appUserId: adminUser.id,
  isAdmin: true,
  canEdit: true,
  updatedAt: new Date(),
});

const [flChannel] = await db
  .insert(Channel)
  .values({
    name: 'The Dorean Principle',
    slug: 'dorean',
    avatarPath: 'dorean-principle/avatar.png',
    approvedAt: new Date(),
    approvedById: adminUser.id,
    updatedAt: new Date(),
  })
  .returning();

await db.insert(ChannelMembership).values({
  channelId: flChannel?.id,
  appUserId: adminUser.id,
  isAdmin: true,
  canEdit: true,
  canDownload: true,
  updatedAt: new Date(),
});

await db.insert(ChannelSubscription).values({
  channelId: flChannel?.id,
  appUserId: adminUser.id,
});

const [flAssoc] = await db
  .insert(OrganizationChannelAssociation)
  .values({
    organizationId: flId,
    channelId: flChannel?.id,
    officialChannel: true,
    updatedAt: new Date(),
  })
  .returning();

const flAssociations = [{ channel: { id: flAssoc?.channelId } }];

await indexDocument('organization', flId);

await Promise.all([
  indexDocument('channel', lcAssociations[0].channel.id),
  indexDocument('channel', flAssociations[0].channel.id),
]);

// Create Organization 1
const [org01] = await db
  .insert(Organization)
  .values({
    name: 'Organization 1',
    slug: 'org1',
    approvedAt: new Date(),
    approvedById: adminUser.id,
    automaticallyApproveOrganizationAssociations: true,
    updatedAt: new Date(),
  })
  .returning();
const org01id = org01?.id;

await db.insert(OrganizationMembership).values({
  organizationId: org01id,
  appUserId: user1.id,
  isAdmin: true,
  canEdit: true,
  updatedAt: new Date(),
});

const [org01Channel] = await db
  .insert(Channel)
  .values({
    name: 'Channel 1',
    slug: 'ch1',
    approvedAt: new Date(),
    approvedById: adminUser.id,
    updatedAt: new Date(),
  })
  .returning();

await db.insert(ChannelMembership).values({
  channelId: org01Channel?.id,
  appUserId: user1.id,
  isAdmin: true,
  canEdit: true,
  canDownload: true,
  updatedAt: new Date(),
});

const [org01Assoc] = await db
  .insert(OrganizationChannelAssociation)
  .values({
    organizationId: org01id,
    channelId: org01Channel?.id,
    officialChannel: true,
    updatedAt: new Date(),
  })
  .returning();

const org01Associations = [{ channel: { id: org01Assoc?.channelId } }];

await indexDocument('organization', org01id);
await Promise.all(
  org01Associations.map(({ channel }) => indexDocument('channel', channel.id)),
);

// Create Organization 3
const [org03] = await db
  .insert(Organization)
  .values({
    name: 'Organization 3',
    slug: 'org3',
    approvedAt: new Date(),
    approvedById: adminUser.id,
    automaticallyApproveOrganizationAssociations: true,
    updatedAt: new Date(),
  })
  .returning();
const org03Id = org03?.id;

await db.insert(OrganizationMembership).values({
  organizationId: org03Id,
  appUserId: user2.id,
  isAdmin: true,
  canEdit: true,
  updatedAt: new Date(),
});

const [org03Channel] = await db
  .insert(Channel)
  .values({
    name: 'Channel 3',
    slug: 'ch3',
    approvedAt: new Date(),
    approvedById: adminUser.id,
    updatedAt: new Date(),
  })
  .returning();

await db.insert(ChannelMembership).values({
  channelId: org03Channel?.id,
  appUserId: user2.id,
  isAdmin: true,
  canEdit: true,
  canDownload: true,
  updatedAt: new Date(),
});

const [org03Assoc] = await db
  .insert(OrganizationChannelAssociation)
  .values({
    organizationId: org03Id,
    channelId: org03Channel?.id,
    officialChannel: true,
    updatedAt: new Date(),
  })
  .returning();

const org03Associations = [{ channel: { id: org03Assoc?.channelId } }];

await db.insert(OrganizationOrganizationAssociation).values({
  upstreamOrganizationId: lcId,
  downstreamOrganizationId: org03Id,
  upstreamApproved: true,
  downstreamApproved: true,
  updatedAt: new Date(),
});

await indexDocument('organization', org03Id);
await Promise.all(
  org03Associations.map(({ channel }) => indexDocument('channel', channel.id)),
);

// Helper to create a church organization with channel and membership
async function createChurch(data: {
  name: string;
  slug: string;
  description?: string;
  tags: string[];
  primaryEmail?: string | null;
  primaryPhoneNumber?: string | null;
  websiteUrl?: string | null;
  address?: {
    type: 'MEETING' | 'MAILING' | 'OFFICE' | 'OTHER';
    query?: string | null;
    country?: string | null;
    locality?: string | null;
    region?: string | null;
    postalCode?: string | null;
    streetAddress?: string | null;
    longitude?: number | null;
    latitude?: number | null;
    geocodingJson?: unknown;
  };
  channelName?: string;
  channelSlug?: string;
  memberId: string;
  lcUpstreamAssociation?: boolean;
}) {
  const [org] = await db
    .insert(Organization)
    .values({
      name: data.name,
      slug: data.slug,
      description: data.description,
      type: 'CHURCH',
      approvedAt: new Date(),
      approvedById: adminUser.id,
      primaryEmail: data.primaryEmail,
      primaryPhoneNumber: data.primaryPhoneNumber,
      websiteUrl: data.websiteUrl,
      automaticallyApproveOrganizationAssociations: false,
      updatedAt: new Date(),
    })
    .returning();

  if (!org) {
    throw new Error('Failed to create church organization');
  }

  if (data.tags.length > 0) {
    await db.insert(OrganizationTagInstance).values(
      data.tags.map((tagSlug) => ({
        organizationId: org.id,
        tagSlug,
      })),
    );
  }

  if (data.address) {
    await db.insert(OrganizationAddress).values({
      organizationId: org.id,
      type: data.address.type,
      query: data.address.query,
      country: data.address.country,
      locality: data.address.locality,
      region: data.address.region,
      postalCode: data.address.postalCode,
      streetAddress: data.address.streetAddress,
      longitude: data.address.longitude,
      latitude: data.address.latitude,
      geocodingJson: data.address.geocodingJson as
        | Record<string, unknown>
        | null
        | undefined,
    });
  }

  await db.insert(OrganizationMembership).values({
    organizationId: org.id,
    appUserId: data.memberId,
    isAdmin: true,
    canEdit: true,
    updatedAt: new Date(),
  });

  if (data.lcUpstreamAssociation) {
    await db.insert(OrganizationOrganizationAssociation).values({
      upstreamOrganizationId: lcId,
      downstreamOrganizationId: org.id,
      upstreamApproved: true,
      downstreamApproved: true,
      updatedAt: new Date(),
    });
  }

  if (data.channelName && data.channelSlug) {
    const [channel] = await db
      .insert(Channel)
      .values({
        name: data.channelName,
        slug: data.channelSlug,
        approvedAt: new Date(),
        approvedById: adminUser.id,
        updatedAt: new Date(),
      })
      .returning();

    await db.insert(OrganizationChannelAssociation).values({
      organizationId: org.id,
      channelId: channel?.id,
      officialChannel: true,
      updatedAt: new Date(),
    });
  }

  return org;
}

const org04 = await createChurch({
  name: 'Baptist, But Not Too Baptist, Community Church',
  slug: 'baptist-la',
  description: 'We are a church that is baptist, but not too baptist.',
  tags: [baptistTagSlug, calvinisticBaptistTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Baptist, But Not Too Baptist, Sermons',
  channelSlug: 'baptist-la',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org04.id);

const org05 = await createChurch({
  name: 'Desert Debaters Society',
  slug: 'desert-debaters',
  description: 'We are a church that is all about debating in the desert.',
  tags: [baptistTagSlug, reformedBaptistTagSlug, reformedTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Desert Debates',
  channelSlug: 'desert-debates',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org05.id);

const org06 = await createChurch({
  name: 'Moss Cows',
  slug: 'moss-cows',
  description: 'We are a church that is all about moss and all about cows.',
  tags: [presbyterianTagSlug, presbyterianCrecTagSlug, reformedTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Paint Dries, Moss Cows',
  channelSlug: 'pdmc',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org06.id);

const org07 = await createChurch({
  name: 'Gopher Wood Gospel Hall',
  slug: 'gwgh',
  description:
    'We are a church that is all about large structures made of gopher wood.',
  tags: [independentTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: '40 Days',
  channelSlug: '40days',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org07.id);

const org08 = await createChurch({
  name: 'Bananarama Bible Church',
  slug: 'banana',
  description:
    'We are a church that is all about bananas and all about the Bible.',
  tags: [independentTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Potassium Carb Sticks',
  channelSlug: 'pc-sticks',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org08.id);

const org09 = await createChurch({
  name: "Cotton's Finger Lutheran Church",
  slug: 'cotton',
  description: 'We are a church that is all about baumwollfinger.',
  tags: [augsburgConfessionTagSlug, lutheranTagSlug, lutheranAalcTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'T-Shirts and Theology',
  channelSlug: 't-shirts-and-theology',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org09.id);

const org10 = await createChurch({
  name: 'Harbor Faith Tabernacle',
  slug: 'harbor',
  description:
    'We are a church that is all about harbors and #superiortheology.',
  tags: [baptistTagSlug, reformedBaptistTagSlug, reformedTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Harbor Faith Tabernacle Sermons',
  channelSlug: 'harbor-faith',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org10.id);

const org11 = await createChurch({
  name: 'Mariners Metanoia Manor',
  slug: 'mariners',
  description: 'We are a church that is all about ships that change direction.',
  tags: [baptistTagSlug, reformedBaptistTagSlug, reformedTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'About Face',
  channelSlug: 'about-face',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org11.id);

const org12 = await createChurch({
  name: "Prosperity's Pitfall Pavilion",
  slug: 'ppp',
  description:
    'We are a church where you will learn about the pitfalls of the prosperity gospel, which is not a gospel.',
  tags: [baptistTagSlug, calvinisticBaptistTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Kootny',
  channelSlug: 'kootny',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org12.id);

const org13 = await createChurch({
  name: 'Screwtape Sanctuary',
  slug: 'screwtape',
  description: 'We like C.S. Lewis.',
  tags: [presbyterianPcaTagSlug, presbyterianTagSlug, reformedTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Screwtape Sermons',
  channelSlug: 'screwtape',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org13.id);

const org14 = await createChurch({
  name: 'Solas Sanctuary',
  slug: 'solas',
  description: 'We are a church that is all about the five solas.',
  tags: [presbyterianTagSlug, reformedTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Grace Sermons',
  channelSlug: 'grace',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org14.id);

const org15 = await createChurch({
  name: 'Sovereign Joy Sanctuary',
  slug: 'sovereign-joy',
  description:
    'We are a church that is all about the sovereignty of God and the joy of the saints.',
  tags: [baptistTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Happy Sermons',
  channelSlug: 'happy',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org15.id);

const org16 = await createChurch({
  name: 'Clapback Chapel',
  slug: 'clapback',
  description: 'We are a church that is all about clapping back at the world.',
  tags: [baptistTagSlug],
  primaryEmail: faker.internet.email(),
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
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
  channelName: 'Clapback Sermons',
  channelSlug: 'clapback',
  memberId: adminUser.id,
  lcUpstreamAssociation: true,
});

await indexDocument('organization', org16.id);

// Test churches for empty state conditions on profile page

// Church without channels but WITH email contact
const org17 = await createChurch({
  name: 'Grace Fellowship (Email Only)',
  slug: 'grace-fellowship-email',
  description:
    'A friendly church community. Contact us to request we upload our sermons!',
  tags: [reformedTagSlug],
  primaryEmail: 'contact@gracefellowship.example',
  primaryPhoneNumber: null,
  websiteUrl: null,
  address: {
    type: 'MEETING',
    query: 'Portland, Oregon, United States',
    country: 'United States',
    locality: 'Portland',
    region: 'Oregon',
    postalCode: null,
    streetAddress: null,
    longitude: -122.676483,
    latitude: 45.523064,
  },
  memberId: adminUser.id,
});

await indexDocument('organization', org17.id);

// Church without channels but WITH phone and website (no email)
const org18 = await createChurch({
  name: 'Community Bible Church (Phone/Web)',
  slug: 'community-bible-phone-web',
  description: 'Serving our community with biblical teaching.',
  tags: [baptistTagSlug],
  primaryEmail: null,
  primaryPhoneNumber:
    parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
  websiteUrl: faker.internet.url(),
  address: {
    type: 'MEETING',
    query: 'Austin, Texas, United States',
    country: 'United States',
    locality: 'Austin',
    region: 'Texas',
    postalCode: null,
    streetAddress: null,
    longitude: -97.743061,
    latitude: 30.267153,
  },
  memberId: adminUser.id,
});

await indexDocument('organization', org18.id);

// Church without channels and WITHOUT any contact info
// Note: This shouldn't happen in production, but we test it anyway
const org19 = await createChurch({
  name: 'Silent Church (No Contact)',
  slug: 'silent-church-no-contact',
  description:
    'A church with no contact information. This should not show the Official Channels section.',
  tags: [independentTagSlug],
  primaryEmail: null,
  primaryPhoneNumber: null,
  websiteUrl: null,
  address: {
    type: 'MEETING',
    query: 'Denver, Colorado, United States',
    country: 'United States',
    locality: 'Denver',
    region: 'Colorado',
    postalCode: null,
    streetAddress: null,
    longitude: -104.990251,
    latitude: 39.739236,
  },
  memberId: adminUser.id,
});

await indexDocument('organization', org19.id);

const [sellingJesusChannel] = await db
  .insert(Channel)
  .values({
    name: 'Selling Jesus',
    slug: 'selling-jesus',
    description:
      'Selling Jesus is a ministry that seeks to expose the commercialization of Christianity.',
    avatarPath: 'selling-jesus/avatar.jpg',
    approvedAt: new Date(),
    approvedById: adminUser.id,
    updatedAt: new Date(),
  })
  .returning();

await db.insert(ChannelMembership).values({
  channelId: sellingJesusChannel?.id,
  appUserId: adminUser.id,
  isAdmin: true,
  canEdit: true,
  canDownload: true,
  updatedAt: new Date(),
});

await db.insert(ChannelSubscription).values({
  channelId: sellingJesusChannel?.id,
  appUserId: adminUser.id,
});

await indexDocument('channel', sellingJesusChannel?.id);

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
  const channelSlug = faker.internet.domainWord();

  const memberId = faker.helpers.arrayElement(otherIds);

  const org = await createChurch({
    name,
    slug: slugify(name),
    description: faker.lorem.paragraph(),
    tags: denomination,
    primaryEmail: faker.internet.email(),
    primaryPhoneNumber:
      parsePhoneNumber(faker.phone.number(), 'US')?.number ?? null,
    websiteUrl: faker.internet.url(),
    address: {
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
    channelName: faker.internet.domainWord(),
    channelSlug,
    memberId,
  });

  await indexDocument('organization', org.id);
}

await indexDocument('organization', lcId);

const doreanPrincipleChannel = await db.query.Channel.findFirst({
  columns: { id: true },
  where: (t, { eq }) => eq(t.slug, 'dorean'),
});
if (!doreanPrincipleChannel) throw new Error('Dorean channel not found');
const doreanPrincipleChannelId = doreanPrincipleChannel.id;

type UploadRecordInsert = typeof UploadRecord.$inferInsert;

const baseUploadRecord: Omit<UploadRecordInsert, 'id'> = {
  appUserId: adminUser.id,
  channelId: doreanPrincipleChannelId,
  uploadFinalized: true,
  uploadFinalizedById: adminUser.id,
  license: 'CC0',
  visibility: 'PUBLIC',
  variants: ['AUDIO'],
  transcodingFinishedAt: new Date(),
  transcribingFinishedAt: new Date(),
  transcodingProgress: 0,
  score: 0,
  updatedAt: new Date(),
};

const uploadRecordData: Array<UploadRecordInsert> = [
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000000',
    title: 'Foreword',
    uploadSizeBytes: BigInt(2986193),
    lengthSeconds: 186.566531,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Introduction',
    uploadSizeBytes: BigInt(3272913),
    lengthSeconds: 204.486531,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000001.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000002',
    title: 'Chapter 1 - The Command of Christ',
    uploadSizeBytes: BigInt(22962385),
    lengthSeconds: 1435.08898,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000002.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000003',
    title: 'Chapter 2 - The Policy of Paul',
    uploadSizeBytes: BigInt(17471697),
    lengthSeconds: 1091.918367,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000003/00000000-0000-4000-8000-000000000003.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000004',
    title: 'Chapter 3 - The Triangle of Obligation',
    uploadSizeBytes: BigInt(17115345),
    lengthSeconds: 1069.708367,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000004/00000000-0000-4000-8000-000000000004.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000005',
    title: 'Chapter 4 - The Burden of Support',
    uploadSizeBytes: BigInt(16812241),
    lengthSeconds: 1050.763061,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000005/00000000-0000-4000-8000-000000000005.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000006',
    title: 'Chapter 5 - The Preogative of Servanthood',
    uploadSizeBytes: BigInt(19398865),
    lengthSeconds: 1212.430612,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000006/00000000-0000-4000-8000-000000000006.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000007',
    title: 'Chapter 6 - The Sincerity of Ministry',
    uploadSizeBytes: BigInt(16396497),
    lengthSeconds: 1024.786531,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000007/00000000-0000-4000-8000-000000000007.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000008',
    title: 'Chapter 7 - The Greed of Wolves',
    uploadSizeBytes: BigInt(19323089),
    lengthSeconds: 1207.640816,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000008/00000000-0000-4000-8000-000000000008.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000009',
    title: 'Chapter 8 - The Apostles of Corinth',
    uploadSizeBytes: BigInt(17832145),
    lengthSeconds: 1114.357551,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000009/00000000-0000-4000-8000-000000000009.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000a',
    title: 'Chapter 9 - The Pattern of Colabor',
    uploadSizeBytes: BigInt(18325713),
    lengthSeconds: 1145.260408,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-00000000000a/00000000-0000-4000-8000-00000000000a.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000b',
    title: 'Chapter 10 - The Testimony of History',
    uploadSizeBytes: BigInt(16933073),
    lengthSeconds: 1058.220408,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-00000000000b/00000000-0000-4000-8000-00000000000b.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000c',
    title: 'Chapter 11 - The Scope of Ministry',
    uploadSizeBytes: BigInt(17428689),
    lengthSeconds: 1089.253878,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-00000000000c/00000000-0000-4000-8000-00000000000c.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000d',
    title: 'Chapter 12 - The Challenge of Parachurch',
    uploadSizeBytes: BigInt(16756945),
    lengthSeconds: 1047.308571,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-00000000000d/00000000-0000-4000-8000-00000000000d.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000e',
    title: 'Chapter 13 - The Issue of Copyright',
    uploadSizeBytes: BigInt(18176209),
    lengthSeconds: 1135.908571,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-00000000000e/00000000-0000-4000-8000-00000000000e.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-00000000000f',
    title: 'Chapter 14 - The Path of Progress',
    uploadSizeBytes: BigInt(16425169),
    lengthSeconds: 1026.45551,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-00000000000f/00000000-0000-4000-8000-00000000000f.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000010',
    title: 'Conclusion',
    uploadSizeBytes: BigInt(1954713),
    lengthSeconds: 121.939592,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000010/00000000-0000-4000-8000-000000000010.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000011',
    title: 'Appendix A - Further Study',
    uploadSizeBytes: BigInt(1343046),
    lengthSeconds: 83.748571,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000011/00000000-0000-4000-8000-000000000011.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000012',
    title: 'Appendix B - Copyright in the United States',
    uploadSizeBytes: BigInt(3256996),
    lengthSeconds: 140.355918,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000012/00000000-0000-4000-8000-000000000012.png',
  },
  {
    ...baseUploadRecord,
    id: '00000000-0000-4000-8000-000000000013',
    title: 'Appendix C - Copyright and Natural Law',
    uploadSizeBytes: BigInt(6713553),
    lengthSeconds: 419.526531,
    defaultThumbnailPath:
      '00000000-0000-4000-8000-000000000013/00000000-0000-4000-8000-000000000013.png',
  },
];

await db.insert(UploadRecord).values(uploadRecordData);

const [series] = await db
  .insert(UploadList)
  .values({
    id: '00000000-0000-4000-8000-000000000000',
    title: 'The Dorean Principle',
    type: 'SERIES',
    authorId: adminUser.id,
    channelId: doreanPrincipleChannelId,
    updatedAt: new Date(),
  })
  .returning({ id: UploadList.id });

let nextRank = 0;

for (const { id } of uploadRecordData) {
  if (!id) {
    throw new Error('Upload record id is missing');
  }
  await db.insert(UploadListEntry).values({
    rank: nextRank,
    uploadRecordId: id,
    uploadListId: series?.id,
  });

  nextRank += 1;
}

const doreanPrincipleUploadId = '00000000-0000-4000-8000-100000000000';

await db.insert(UploadRecord).values({
  id: doreanPrincipleUploadId,
  title: 'The Dorean Principle in Five Minutes',
  description: stripIndent`
    What things are too sacred to be sold? Should Christian ministers ever charge money for things like worship music, preaching, teaching, or counseling?

    This is a quick, broad overview of a simple biblical teaching: accepting support as anything other than an act of co-labor compromises the sincerity of Christian ministry.

    Ministry should be supported but never sold.

    For a more thorough explanation of what is covered in this video, please read or listen to the free book, The Dorean Principle: https://thedoreanprinciple.org/
  `,
  appUserId: adminUser.id,
  channelId: sellingJesusChannel?.id,
  uploadFinalized: true,
  uploadFinalizedById: adminUser.id,
  license: 'CC0',
  visibility: 'PUBLIC',
  variants: ['AUDIO', 'VIDEO_1080P'],
  transcodingFinishedAt: new Date(),
  transcribingFinishedAt: new Date(),
  uploadSizeBytes: BigInt(180000000), // Approximate based on file sizes
  lengthSeconds: 328.26,
  defaultThumbnailPath: `${doreanPrincipleUploadId}/${doreanPrincipleUploadId}.jpg`,
  transcodingProgress: 0,
  score: 0,
  updatedAt: new Date(),
});

const prayerPitchUploadId = '00000000-0000-4000-8000-100000000001';

await db.insert(UploadRecord).values({
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
  channelId: sellingJesusChannel?.id,
  uploadFinalized: true,
  uploadFinalizedById: adminUser.id,
  license: 'CC0',
  visibility: 'PUBLIC',
  variants: ['AUDIO', 'VIDEO_720P'],
  transcodingFinishedAt: new Date(),
  transcribingFinishedAt: new Date(),
  uploadSizeBytes: BigInt(63000000), // Approximate based on file sizes
  lengthSeconds: 327.88391,
  defaultThumbnailPath: `${prayerPitchUploadId}/${prayerPitchUploadId}.jpg`,
  transcodingProgress: 0,
  score: 0,
  updatedAt: new Date(),
});

const christianBooksPitchUploadId = '00000000-0000-4000-8000-100000000002';

await db.insert(UploadRecord).values({
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
  channelId: sellingJesusChannel?.id,
  uploadFinalized: true,
  uploadFinalizedById: adminUser.id,
  license: 'CC0',
  visibility: 'PUBLIC',
  variants: ['AUDIO', 'VIDEO_720P'],
  transcodingFinishedAt: new Date(),
  transcribingFinishedAt: new Date(),
  uploadSizeBytes: BigInt(63000000), // Approximate based on file sizes
  lengthSeconds: 552.199981,
  defaultThumbnailPath: `${christianBooksPitchUploadId}/${christianBooksPitchUploadId}.jpg`,
  transcodingProgress: 0,
  score: 0,
  updatedAt: new Date(),
});

const foreignMissionsUploadId = '00000000-0000-4000-8000-100000000003';

await db.insert(UploadRecord).values({
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
  channelId: sellingJesusChannel?.id,
  uploadFinalized: true,
  uploadFinalizedById: adminUser.id,
  license: 'CC0',
  visibility: 'PUBLIC',
  variants: ['AUDIO', 'VIDEO_720P'],
  transcodingFinishedAt: new Date(),
  transcribingFinishedAt: new Date(),
  uploadSizeBytes: BigInt(177000000), // Approximate based on download size
  lengthSeconds: 477.034367,
  defaultThumbnailPath: `${foreignMissionsUploadId}/${foreignMissionsUploadId}.jpg`,
  transcodingProgress: 0,
  score: 0,
  updatedAt: new Date(),
});

const copyrightUploadId = '00000000-0000-4000-8000-100000000004';

await db.insert(UploadRecord).values({
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
  channelId: sellingJesusChannel?.id,
  uploadFinalized: true,
  uploadFinalizedById: adminUser.id,
  license: 'CC0',
  visibility: 'PUBLIC',
  variants: ['AUDIO', 'VIDEO_720P'],
  transcodingFinishedAt: new Date(),
  transcribingFinishedAt: new Date(),
  uploadSizeBytes: BigInt(162000000), // Approximate based on download size
  lengthSeconds: 429.769433,
  defaultThumbnailPath: `${copyrightUploadId}/${copyrightUploadId}.jpg`,
  transcodingProgress: 0,
  score: 0,
  updatedAt: new Date(),
});

const biblicalCounselingUploadId = '00000000-0000-4000-8000-100000000005';

await db.insert(UploadRecord).values({
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
  channelId: sellingJesusChannel?.id,
  uploadFinalized: true,
  uploadFinalizedById: adminUser.id,
  license: 'CC0',
  visibility: 'PUBLIC',
  variants: ['AUDIO', 'VIDEO_720P'],
  transcodingFinishedAt: new Date(),
  transcribingFinishedAt: new Date(),
  uploadSizeBytes: BigInt(168000000), // Approximate based on download size
  lengthSeconds: 377.673333,
  defaultThumbnailPath: `${biblicalCounselingUploadId}/${biblicalCounselingUploadId}.jpg`,
  transcodingProgress: 0,
  score: 0,
  updatedAt: new Date(),
});

const lordsSupperUploadId = '00000000-0000-4000-8000-100000000006';

await db.insert(UploadRecord).values({
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
  channelId: sellingJesusChannel?.id,
  uploadFinalized: true,
  uploadFinalizedById: adminUser.id,
  license: 'CC0',
  visibility: 'PUBLIC',
  variants: ['AUDIO', 'VIDEO_720P'],
  transcodingFinishedAt: new Date(),
  transcribingFinishedAt: new Date(),
  uploadSizeBytes: BigInt(137000000), // Approximate based on download size
  lengthSeconds: 313.4054,
  defaultThumbnailPath: `${lordsSupperUploadId}/${lordsSupperUploadId}.jpg`,
  transcodingProgress: 0,
  score: 0,
  updatedAt: new Date(),
});

// Seed featured uploads
await db.insert(FeaturedUpload).values([
  {
    uploadRecordId: '00000000-0000-4000-8000-000000000001', // Introduction from The Dorean Principle
    rank: 0,
    updatedAt: new Date(),
  },
  {
    uploadRecordId: prayerPitchUploadId, // Prayer Pitch Meeting - 1
    rank: 1,
    updatedAt: new Date(),
  },
  {
    uploadRecordId: foreignMissionsUploadId, // Foreign Missions Pitch Meeting - 3
    rank: 2,
    updatedAt: new Date(),
  },
  {
    uploadRecordId: biblicalCounselingUploadId, // Biblical Counseling Pitch Meeting - 5
    rank: 3,
    updatedAt: new Date(),
  },
  {
    uploadRecordId: '00000000-0000-4000-8000-000000000010', // Conclusion from The Dorean Principle
    rank: 4,
    updatedAt: new Date(),
  },
]);

// LLM seed phase. Runs AFTER every UploadRecord insert above so the
// upload_record_id FK is satisfied. The list of uploads + the directory
// path live in `./llm-seed.ts` so the dumper and the seed agree on both.
//
// Two paths:
//
// 1. Default (snapshot path) — direct-insert the LLM-derived state from
//    the committed snapshot JSONs under `seed-data/llm/` (read via the
//    `./seed-data:/seed-data` bind mount). Fast and free — no OpenRouter
//    calls.
//
// 2. `LIVE_PIPELINE=1` — run the real summarizeUploadWorkflow against the
//    background-worker (which has OPENROUTER_API_KEY), waiting for each.
//    Used to refresh the snapshots after a prompt change or transcript
//    regen: `LIVE_PIPELINE=1 just seed-db` then `just dump-llm-seed-data`
//    snapshots the result back into the repo. See `docs/seed-data.md`.
if (process.env.LIVE_PIPELINE === '1') {
  const temporalClient = await client;
  for (const uploadId of LLM_SEEDED_UPLOAD_IDS) {
    console.log(`[seed:live] storing transcript paragraphs for ${uploadId}`);
    await storeTranscriptParagraphs(uploadId, `${uploadId}/transcript.json`);

    console.log(
      `[seed:live] generating summaries + embeddings for ${uploadId}`,
    );
    const handle = await temporalClient.workflow.start(
      summarizeUploadWorkflow,
      {
        taskQueue: 'background',
        workflowId: makeSummarizeUploadWorkflowId(uploadId),
        args: [uploadId, { embedParagraphs: true }],
        typedSearchAttributes: [{ key: UPLOAD_ID_KEY, value: uploadId }],
        retry: { maximumAttempts: 3 },
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      },
    );
    await handle.result();
    console.log(`[seed:live] ${uploadId} done`);
  }
} else {
  for (const uploadId of LLM_SEEDED_UPLOAD_IDS) {
    const snapshot: LlmSeedSnapshot = JSON.parse(
      await readFile(path.join(LLM_SEED_DATA_DIR, `${uploadId}.json`), 'utf-8'),
    );
    console.log(
      `[seed] loading LLM snapshot for ${uploadId} (${snapshot.paragraphs.length} paragraphs)`,
    );

    // `.returning({ id, order })` so we can map snapshot annotations
    // (keyed by paragraph order) onto the newly-inserted paragraph ids.
    const insertedParagraphs = await db
      .insert(TranscriptParagraph)
      .values(
        snapshot.paragraphs.map((p) => ({
          uploadRecordId: uploadId,
          order: p.order,
          start: p.start,
          end: p.end,
          speaker: p.speaker,
          speakerEmbedding: p.speakerEmbedding,
          text: p.text,
          words: p.words,
          embedding: p.embedding,
        })),
      )
      .returning({
        id: TranscriptParagraph.id,
        order: TranscriptParagraph.order,
      });

    const paragraphIdByOrder = new Map(
      insertedParagraphs.map((p) => [p.order, p.id]),
    );
    const annotationInserts = snapshot.paragraphs.flatMap((p) => {
      const paragraphId = paragraphIdByOrder.get(p.order);
      if (!paragraphId) return [];
      return p.annotations.map((a) => ({
        // Preserve the dumped id so `upload_record.sections` (keyed by
        // OUTLINE annotation id) stays joinable on reseed. Falls through
        // to drizzle's default `gen_random_uuid()` when the snapshot
        // predates id preservation (pre-2026-06 dumps) — those uploads
        // need a re-summarize + re-dump to recover their section
        // descriptions.
        ...(a.id ? { id: a.id } : {}),
        paragraphId,
        kind: a.kind,
        startWord: a.startWord,
        endWord: a.endWord,
        rawSpan: a.rawSpan,
        metadata: a.metadata,
        updatedAt: new Date(),
      }));
    });
    if (annotationInserts.length > 0) {
      await db.insert(Annotation).values(annotationInserts);
    }

    await db
      .update(UploadRecord)
      .set({
        summary: snapshot.summary,
        searchSummary: snapshot.searchSummary,
        // Older snapshots predate the sections column — fall through to []
        // to match the upload_record default rather than failing the seed.
        sections: snapshot.sections ?? [],
        summaryEmbedding: snapshot.summaryEmbedding,
        searchSummaryEmbedding: snapshot.searchSummaryEmbedding,
        summarizedAt: new Date(snapshot.summarizedAt),
      })
      .where(eq(UploadRecord.id, uploadId));
    // Media docs are indexed once at the very end of the seed (below), after
    // speaker attributions exist — so each lc_media_v1 doc carries its speaker
    // rollup and the voice vectors reach lc_speaker_vectors.
  }
}

// ---------------------------------------------------------------------------
// Speakers + attributions
//
// Exported from the dev database so a reseed reproduces the named speakers and
// the (upload, diarization-label) → speaker attributions that drive the media
// speaker rollups, the labeling queue, and the admin speaker tools. Speaker ids
// are pinned so the attributions below (and any future seed rows) stay joinable
// across reseeds; attributions reference the fixed upload ids defined above.
// ---------------------------------------------------------------------------
const channelIdBySlug: Record<string, string | undefined> = {
  dorean: doreanPrincipleChannelId,
  'selling-jesus': sellingJesusChannel?.id,
};

const speakerSeedData = [
  {
    id: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    name: 'Conley Owens',
    slug: 'conley-owens',
    channelSlug: 'dorean',
  },
  {
    id: 'c1ab1621-2455-4419-98c7-ca5bde3f87bf',
    name: 'Joseph M. Jacowitz',
    slug: 'joseph-m-jacowitz',
    channelSlug: 'dorean',
  },
  {
    id: '19bc911a-7482-4c66-b254-cd1a9432355b',
    name: 'Andrew Case',
    slug: 'andrew-case',
    channelSlug: 'selling-jesus',
  },
] as const;

await db.insert(Speaker).values(
  speakerSeedData.map((s) => {
    const channelId = channelIdBySlug[s.channelSlug];
    invariant(channelId, `Channel ${s.channelSlug} not found for speaker seed`);
    return {
      id: s.id,
      channelId,
      name: s.name,
      slug: s.slug,
      createdById: adminUser.id,
      updatedAt: new Date(),
    };
  }),
);

const speakerAttributionSeedData = [
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000000',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: 'c1ab1621-2455-4419-98c7-ca5bde3f87bf',
    uploadId: '00000000-0000-4000-8000-000000000000',
    speakerLabel: 'SPEAKER_01',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000001',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000002',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000003',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000004',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000005',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000006',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000007',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000008',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000009',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-00000000000a',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-00000000000b',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-00000000000c',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-00000000000d',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-00000000000e',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-00000000000f',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000010',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000011',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000012',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '48326f0c-04a7-43d5-ae43-e1d179d29904',
    uploadId: '00000000-0000-4000-8000-000000000013',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000000',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000001',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000002',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000002',
    speakerLabel: 'SPEAKER_01',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000002',
    speakerLabel: 'SPEAKER_02',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000003',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000003',
    speakerLabel: 'SPEAKER_01',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000004',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000005',
    speakerLabel: 'SPEAKER_00',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000005',
    speakerLabel: 'SPEAKER_01',
  },
  {
    speakerId: '19bc911a-7482-4c66-b254-cd1a9432355b',
    uploadId: '00000000-0000-4000-8000-100000000006',
    speakerLabel: 'SPEAKER_00',
  },
] as const;

await db.insert(SpeakerAttribution).values(
  speakerAttributionSeedData.map((a) => ({
    speakerId: a.speakerId,
    uploadRecordId: a.uploadId,
    speakerLabel: a.speakerLabel,
    createdById: adminUser.id,
    updatedAt: new Date(),
  })),
);

// Index every LLM-seeded upload's media doc once, now that paragraphs,
// summaries, annotations, AND speaker attributions are all in place. This is
// the single media-index pass for the seed: each lc_media_v1 doc gets its
// speaker rollup, and the per-attributed-label mean voice vectors are synced
// into lc_speaker_vectors — the index the labeling queue's kNN suggestions and
// the admin speaker tools read from. (Indexing earlier, before attributions,
// would leave both empty.)
for (const uploadId of LLM_SEEDED_UPLOAD_IDS) {
  await indexDocument('media', uploadId);
}
