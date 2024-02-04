import { input, select, confirm } from '@inquirer/prompts';
import short from 'short-uuid';
import { ChannelVisibility } from '@prisma/client';
import prisma from '../src/util/prisma';
import logger from '../src/util/logger';

const name = await input({ message: 'Name:' });
const slug = await input({ message: 'Slug:' });
const username = await input({ message: 'Admin Username:' });
const visibility = await select({
  message: 'Admin Username:',
  choices: [
    { name: 'Public', value: ChannelVisibility.PUBLIC },
    { name: 'Private', value: ChannelVisibility.PRIVATE },
    { name: 'Unlisted', value: ChannelVisibility.UNLISTED },
  ],
});

if (
  !(await confirm({
    message: 'Create channel with provided details?',
    default: false,
  }))
) {
  process.exit(0);
}

const channel = await prisma.channel.create({
  data: {
    name,
    slug,
    visibility,
    memberships: {
      create: {
        appUser: {
          connect: { username },
        },
        isAdmin: true,
      },
    },
  },
});

const translator = short();

logger.info('Channel created!');
logger.info(channel.id);
logger.info(translator.fromUUID(channel.id));
