import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const { DATABASE_URL } = z
  .object({ DATABASE_URL: z.string() })
  .parse(process.env);

export default new PrismaClient({
  log: ['query', 'info'],
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

export function getLoglessClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });
}
