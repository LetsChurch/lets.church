import { Pool } from 'pg';

export function createPool(connectionString: string) {
  return new Pool({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
  });
}
