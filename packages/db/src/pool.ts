import { Pool, type PoolConfig } from 'pg';

export function createPool(connectionString: string) {
  // TLS is off unless DATABASE_SSL=true. When on, verify the server cert
  // against a provided CA (DATABASE_SSL_CA, PEM); without a CA, fall back to
  // unverified TLS to preserve the historical behavior managed-Postgres
  // deployments rely on. Provide the CA to harden the connection.
  let ssl: PoolConfig['ssl'] = false;
  if (process.env.DATABASE_SSL === 'true') {
    const ca = process.env.DATABASE_SSL_CA;
    if (ca) {
      ssl = { ca, rejectUnauthorized: true };
    } else {
      console.warn(
        '[db] DATABASE_SSL is on but no DATABASE_SSL_CA was provided — TLS certificate verification is DISABLED. Set the CA to enable it.',
      );
      ssl = { rejectUnauthorized: false };
    }
  }
  return new Pool({ connectionString, ssl });
}
