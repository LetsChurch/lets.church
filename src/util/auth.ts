import argon2 from 'argon2';
import db from './db';
import { parseSessionJwt } from './jwt';

export async function login(id: string, password: string) {
  const user = await db.appUser.findFirst({
    where: {
      OR: [{ username: id }, { emails: { some: { email: id } } }],
    },
  });

  if (!user || !(await argon2.verify(user.password, password))) {
    throw new Error('Error logging in. Please try again.');
  }

  const session = await db.appSession.create({
    data: { appUserId: user.id },
  });

  return session;
}

export async function getSession(cookie: string) {
  const jwt = await parseSessionJwt(cookie);

  if (!jwt) {
    return null;
  }

  const session = await db.appSession.findUnique({
    where: {
      id: jwt.sub,
      expiresAt: { gt: new Date() },
    },
  });

  return session;
}
