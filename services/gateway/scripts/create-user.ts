import {
  input,
  password as passwordInput,
  select,
  confirm,
} from '@inquirer/prompts';
import { z } from 'zod';
import argon2 from 'argon2';
import short from 'short-uuid';
import { faker } from '@faker-js/faker';
import prisma from '../src/util/prisma';
import logger from '../src/util/logger';

const username = await input({ message: 'Username:' });
const email = await input({
  message: 'Email:',
  validate: (val) => z.string().email().safeParse(val).success,
});

let printPassword = false;
let password = await passwordInput({
  message: 'Password:',
});

if (!password) {
  password = faker.internet.password({ length: 20, memorable: true });
  printPassword = true;
}

const role = await select({
  message: 'Role:',
  choices: [
    { name: 'User', value: 'USER' },
    { name: 'Admin', value: 'ADMIN' },
  ],
});

if (
  !(await confirm({
    message: 'Create user with provided details?',
    default: false,
  }))
) {
  process.exit(0);
}

const user = await prisma.appUser.create({
  data: {
    username,
    password: await argon2.hash(password, { type: argon2.argon2id }),
    role: z.enum(['USER', 'ADMIN'] as const).parse(role),
    emails: {
      create: { email, verifiedAt: new Date() },
    },
  },
});

const translator = short();

logger.info('User created!');
logger.info(user.id);
logger.info(translator.fromUUID(user.id));

if (printPassword) {
  logger.info({ password });
}
