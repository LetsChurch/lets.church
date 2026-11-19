import type { TransactionClient } from '@letschurch/db';
import { DonationDonor } from '@letschurch/db/schema';
import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@letschurch/db', async () => ({
  ...(await import('@letschurch/db/schema')),
  db: {},
}));

const { releaseDonorEmailForUser } = await import('./identity');

const dialect = new PgDialect();

type Update = { table: string; set: Record<string, unknown>; where: string };

function fakeTx(verifiedRow: { id: string } | undefined) {
  const updates: Update[] = [];
  const tx = {
    query: {
      AppUserEmail: { findFirst: vi.fn(async () => verifiedRow) },
    },
    update: (table: typeof DonationDonor) => ({
      set: (set: Record<string, unknown>) => ({
        where: async (where: SQL) => {
          updates.push({
            table: getTableName(table),
            set,
            where: dialect.sqlToQuery(where).sql,
          });
        },
      }),
    }),
  };
  return { tx: tx as unknown as TransactionClient, updates };
}

describe('releaseDonorEmailForUser', () => {
  it('adopts unclaimed donors when the released email was verified', async () => {
    const { tx, updates } = fakeTx({ id: 'email-1' });
    await releaseDonorEmailForUser(tx, 'user-1', ' Donor@Example.com ');

    expect(updates).toHaveLength(1);
    const [update] = updates;
    expect(update?.table).toBe(getTableName(DonationDonor));
    expect(update?.set.email).toBeNull();
    expect(update?.set.appUserId).toBeDefined();
    expect(update?.where).not.toContain('"app_user_id"');
  });

  it('never adopts donors for an unverified email, only detaches its own rows', async () => {
    const { tx, updates } = fakeTx(undefined);
    await releaseDonorEmailForUser(tx, 'user-1', 'victim@example.com');

    expect(updates).toHaveLength(1);
    const [update] = updates;
    expect(update?.set).not.toHaveProperty('appUserId');
    expect(update?.set.email).toBeNull();
    expect(update?.where).toContain('"app_user_id"');
  });
});
