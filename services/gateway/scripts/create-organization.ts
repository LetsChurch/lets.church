import { input, editor, select, checkbox, confirm } from '@inquirer/prompts';
import short from 'short-uuid';
import {
  AddressType,
  OrganizationLeaderType,
  OrganizationType,
} from '@prisma/client';
import countries from 'countries-list/minimal/countries.en.min.json';
import prisma from '../src/util/prisma';
import logger from '../src/util/logger';
import { geocodeOrganization } from '../src/temporal';

const name = await input({ message: 'Name:' });
const slug = await input({ message: 'Slug:' });
const description = await editor({ message: 'About:' });
const username = await input({ message: 'Admin Username:' });
const type = await select({
  message: 'Type:',
  choices: [
    { name: 'Church', value: OrganizationType.CHURCH },
    { name: 'Ministry', value: OrganizationType.MINISTRY },
  ],
});

const tagOptions = await prisma.organizationTag.findMany({
  select: { slug: true, label: true },
  take: Number.MAX_SAFE_INTEGER,
  orderBy: { slug: 'asc' },
});

const tags = await checkbox({
  message: 'Tags:',
  choices: tagOptions.map((t) => ({ name: t.label, value: t.slug })),
});

const websiteUrl = await input({ message: 'Website:' });
const primaryEmail = await input({ message: 'Primary Email:' });
const primaryPhoneNumber = await input({ message: 'Primary Phone Number:' });

const addresses = [];

while (
  await confirm({ message: 'Add address?', default: addresses.length === 0 })
) {
  addresses.push({
    type: await select({
      message: 'Type:',
      choices: [
        { name: 'Meeting', value: AddressType.MEETING },
        { name: 'Mailing', value: AddressType.MAILING },
        { name: 'Office', value: AddressType.OFFICE },
        { name: 'Other', value: AddressType.OTHER },
      ],
    }),
    country: await select({
      message: 'Country:',
      choices: [
        { value: 'United States' },
        ...Object.values(countries)
          .filter((c) => c !== 'United States')
          .map((value) => ({ value })),
      ],
    }),
    streetAddress: await input({ message: 'Street Address:' }),
    locality: await input({ message: 'Locality (City):' }),
    region: await input({ message: 'Region (State / Province):' }),
    postalCode: await input({ message: 'Postal Code:' }),
  });
}

const leadership = [];

while (
  await confirm({ message: 'Add leader?', default: leadership.length === 0 })
) {
  leadership.push({
    name: await input({ message: 'Name:' }),
    type: await select({
      message: 'Type:',
      choices: [
        { name: 'Elder', value: OrganizationLeaderType.ELDER },
        { name: 'Deacon', value: OrganizationLeaderType.DEACON },
      ],
    }),
    email: await input({ message: 'Email:' }),
    phoneNumber: await input({ message: 'Phone Number:' }),
  });
}

const assocOrgChoices = await prisma.organization.findMany({
  select: { id: true, name: true },
  where: { automaticallyApproveOrganizationAssociations: true },
});

const associatedOrgs = await checkbox({
  message: 'Associated Organizations',
  choices: assocOrgChoices.map((o) => ({ name: o.name, value: o.id })),
});

if (
  !(await confirm({
    message: 'Create organization with provided details?',
    default: false,
  }))
) {
  process.exit(0);
}

const org = await prisma.organization.create({
  data: {
    name,
    slug,
    description,
    type,
    websiteUrl,
    primaryEmail,
    primaryPhoneNumber,
    tags: {
      createMany: {
        data: tags.map((slug) => ({ tagSlug: slug })),
      },
    },
    memberships: {
      create: {
        appUser: {
          connect: { username },
        },
        isAdmin: true,
      },
    },
    addresses: {
      createMany: {
        data: addresses,
      },
    },
    leaders: {
      createMany: {
        data: leadership,
      },
    },
    upstreamOrganizationAssociations: {
      create: associatedOrgs.map((id) => ({
        upstreamApproved: true,
        downstreamApproved: true,
        upstreamOrganization: { connect: { id } },
      })),
    },
  },
});

const translator = short();

logger.info('Organization created!');
logger.info(org.id);
logger.info(translator.fromUUID(org.id));

logger.info('Queueing geocode job...');

await geocodeOrganization(org.id);
