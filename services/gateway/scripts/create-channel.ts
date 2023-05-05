import { input, confirm } from '@inquirer/prompts';
import short from 'short-uuid';
import prisma from '../src/util/prisma';

const name = await input({ message: 'Name:' });
const slug = await input({ message: 'Slug:' });
const username = await input({ message: 'Admin Username:' });

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

console.log('Channel created!');
console.log(channel.id);
console.log(translator.fromUUID(channel.id));
