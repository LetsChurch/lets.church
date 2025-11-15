import logger from '@letschurch/util';
import { prisma } from '../src';

async function truncateDb() {
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  logger.warn(`Truncating ${tablenames.length} tables...`);

  for (const { tablename } of tablenames) {
    if (tablename !== '_prisma_migrations') {
      try {
        await prisma.$executeRawUnsafe(
          `TRUNCATE TABLE "public"."${tablename}" CASCADE;`,
        );
      } catch (error) {
        logger.error(error);
      }
    }
  }

  logger.info('Done!');
}

truncateDb();
