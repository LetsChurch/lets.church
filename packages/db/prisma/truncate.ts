import { logger } from '@letschurch/util';
import { sql } from 'drizzle-orm';
import { db } from '../src';

async function truncateDb() {
  const tablenames = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname='public'`,
  );

  logger.warn(`Truncating ${tablenames.rows.length} tables...`);

  for (const { tablename } of tablenames.rows) {
    if (tablename !== '_prisma_migrations' && tablename !== '__drizzle_migrations') {
      try {
        await db.execute(
          sql`TRUNCATE TABLE ${sql.identifier('public')}.${sql.identifier(tablename)} CASCADE`,
        );
      } catch (error) {
        logger.error(error);
      }
    }
  }

  logger.info('Done!');
}

truncateDb();
