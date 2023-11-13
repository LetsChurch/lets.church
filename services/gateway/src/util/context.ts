import type { Context as HonoContext } from 'hono';
import { getClientIpAddress } from './request-ip';
import prisma from './prisma';
import { parseSessionJwt } from './jwt';

async function getSession(sessionJwt?: string) {
  if (!sessionJwt) {
    return null;
  }

  const parsed = await parseSessionJwt(sessionJwt);

  if (!parsed) {
    return null;
  }

  const s = prisma.appSession.findFirst({
    where: {
      id: parsed.sub,
      expiresAt: { gt: new Date() },
      deletedAt: null,
    },
    include: {
      appUser: {
        select: { id: true, role: true, emails: { select: { email: true } } },
      },
    },
  });

  return s;
}

export default async function context({ c }: { c: HonoContext }) {
  const sessionJwt = c.req.header('authorization')?.split(' ')[1];
  const session = await getSession(sessionJwt);

  return {
    session,
    clientIp: getClientIpAddress(c.req.raw.headers),
    clientUserAgent: c.req.header('user-agent'),
  };
}

export type Context = Awaited<ReturnType<typeof context>>;
