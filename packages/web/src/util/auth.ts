import { prisma } from '@letschurch/db';
import { getCookie } from '@tanstack/react-start/server';
import argon2 from 'argon2';
import { parseSessionJwt } from './jwt';

export async function login(id: string, password: string) {
  const user = await prisma.appUser.findFirst({
    where: {
      OR: [{ username: id }, { emails: { some: { email: id } } }],
    },
  });

  if (!user || !(await argon2.verify(user.password, password))) {
    throw new Error('Error logging in. Please try again.');
  }

  const session = await prisma.appSession.create({
    data: { appUserId: user.id },
  });

  return session;
}

export async function getSession() {
  const cookie = getCookie('lc-session');

  if (!cookie) {
    return null;
  }

  const jwt = await parseSessionJwt(cookie);

  if (!jwt) {
    return null;
  }

  const session = await prisma.appSession.findUnique({
    where: {
      id: jwt.sub,
      expiresAt: { gt: new Date() },
    },
    include: {
      appUser: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  });

  return session;
}
