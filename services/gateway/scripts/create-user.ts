import {
  input,
  password as passwordInput,
  select,
  confirm,
} from '@inquirer/prompts';
import { z } from 'zod';
import argon2 from 'argon2';
import short from 'short-uuid';
import prisma from '../src/util/prisma';

const username = await input({ message: 'Username:' });
const email = await input({
  message: 'Email:',
  validate: (val) => z.string().email().safeParse(val).success,
});
const password = await argon2.hash(
  await passwordInput({ message: 'Password:' }),
  { type: argon2.argon2id },
);
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
    password,
    role: z.enum(['USER', 'ADMIN'] as const).parse(role),
    emails: {
      create: { email, verifiedAt: new Date() },
    },
  },
});

const translator = short();

console.log('User created!');
console.log(user.id);
console.log(translator.fromUUID(user.id));
