import type { FastifyRequest, FastifyReply } from 'fastify';
import PLazy from 'p-lazy';
import prisma from './prisma';
import { client as esClient } from './elasticsearch';

const COOKIE_KEY = 'lcSessionId';

export default async function context({
  req,
  reply,
}: {
  req: FastifyRequest;
  reply: FastifyReply;
}) {
  const rawCookie = req.cookies[COOKIE_KEY];
  const cookedCookie = rawCookie ? req.unsignCookie(rawCookie) : null;

  console.log({ rawCookie, cookedCookie });

  const session = PLazy.from(async () => {
    if (!cookedCookie || !cookedCookie.valid || !cookedCookie.value) {
      return null;
    }

    const s = prisma.appSession.findFirst({
      where: {
        id: cookedCookie.value,
        expiresAt: { gt: new Date() },
        deletedAt: null,
      },
      include: { appUser: { select: { role: true } } },
    });

    return s;
  });

  function setSessionId(sessionId: string) {
    reply.setCookie(COOKIE_KEY, sessionId, { signed: true });
  }

  function clearSessionId() {
    reply.clearCookie(COOKIE_KEY);
  }

  return {
    prisma,
    esClient,
    sessionId: cookedCookie?.value ?? null,
    session,
    setSessionId,
    clearSessionId,
  };
}

export type Context = Awaited<ReturnType<typeof context>>;
