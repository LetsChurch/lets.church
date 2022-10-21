import type { IncomingMessage, ServerResponse } from 'node:http';
import prisma from './prisma';

export default async function context({}: {
  req: IncomingMessage;
  res: ServerResponse;
}) {
  return {
    prisma,
  };
}

export type Context = Awaited<ReturnType<typeof context>>;
