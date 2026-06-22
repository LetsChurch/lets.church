import { Pool, type PoolConfig } from 'pg';

export function createPool(connectionString: string) {
  // TLS is off unless LETS_BIBLE_DATABASE_SSL=true. When on, verify the server
  // cert against a provided CA (LETS_BIBLE_DATABASE_SSL_CA, PEM); without a CA,
  // fall back to unverified TLS to preserve historical behavior. Provide the CA
  // to harden the connection.
  let ssl: PoolConfig['ssl'] = false;
  if (process.env.LETS_BIBLE_DATABASE_SSL === 'true') {
    const ca = process.env.LETS_BIBLE_DATABASE_SSL_CA;
    if (ca) {
      ssl = { ca, rejectUnauthorized: true };
    } else {
      console.warn(
        '[db] LETS_BIBLE_DATABASE_SSL is on but no LETS_BIBLE_DATABASE_SSL_CA was provided — TLS certificate verification is DISABLED. Set the CA to enable it.',
      );
      ssl = { rejectUnauthorized: false };
    }
  }
  return new Pool({ connectionString, ssl });
}
