import type { FastifyRequest, FastifyReply } from 'fastify';
import { getClientIp } from 'request-ip';
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

export default async function context({
  req,
  reply: _reply,
}: {
  req: FastifyRequest;
  reply: FastifyReply;
}) {
  const sessionJwt = req.headers.authorization?.split(' ')[1];
  const session = await getSession(sessionJwt);

  return {
    session,
    clientIp: getClientIp(req),
    clientUserAgent: req.headers['user-agent'],
  };
}

export type Context = Awaited<ReturnType<typeof context>>;
