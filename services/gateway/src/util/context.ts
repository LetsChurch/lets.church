import envariant from '@knpwrs/envariant';
import type { FastifyRequest, FastifyReply } from 'fastify';
import PLazy from 'p-lazy';
import { whoAmIResponse } from './ory';
import prisma from './prisma';
import { client as esClient } from './elasticsearch';

const ORY_KRATOS_PUBLIC_URL = envariant('ORY_KRATOS_PUBLIC_URL');

export default async function context({
  req,
}: {
  req: FastifyRequest;
  reply: FastifyReply;
}) {
  const cookie = req.headers['cookie'] ?? '';
  const authorization = req.headers['authorization'] ?? '';

  const session = PLazy.from(async () => {
    const res = await fetch(`${ORY_KRATOS_PUBLIC_URL}/sessions/whoami`, {
      headers: { cookie },
    });
    const json = await res.json();

    return whoAmIResponse.parse(json);
  });

  const identity = PLazy.from(async () => {
    const s = await session;

    if ('identity' in s) {
      return s.identity;
    }

    return null;
  });

  return {
    prisma,
    esClient,
    session,
    identity,
    authorization,
  };
}

export type Context = Awaited<ReturnType<typeof context>>;
