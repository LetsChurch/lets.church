import { createHash, randomBytes } from 'node:crypto';

import { AppAuthToken, db, type TransactionClient } from '@letschurch/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import { normalizeEmail } from './normalize-email';

export const EMAIL_SIGN_IN_TTL_MINUTES = 20;
export const PASSWORD_RESET_TTL_MINUTES = 20;

export const normalizeAuthEmail = normalizeEmail;

export function hashAuthToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueAuthToken(input: {
  type: typeof AppAuthToken.$inferInsert.type;
  email: string;
  appUserId?: string | null;
  returnTo?: string | null;
  ttlMinutes: number;
  replaceExisting?: boolean;
}) {
  const now = new Date();
  const email = normalizeAuthEmail(input.email);
  const token = randomBytes(32).toString('base64url');

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${input.type}:${email}`}, 0))`,
    );

    if (input.replaceExisting !== false) {
      await tx
        .update(AppAuthToken)
        .set({ consumedAt: now })
        .where(
          and(
            eq(AppAuthToken.type, input.type),
            eq(AppAuthToken.email, email),
            isNull(AppAuthToken.consumedAt),
          ),
        );
    }

    const [record] = await tx
      .insert(AppAuthToken)
      .values({
        type: input.type,
        tokenHash: hashAuthToken(token),
        email,
        appUserId: input.appUserId ?? null,
        returnTo: input.returnTo ?? null,
        expiresAt: new Date(now.getTime() + input.ttlMinutes * 60_000),
      })
      .returning({ id: AppAuthToken.id });

    if (!record) {
      throw new Error('Failed to create authentication token');
    }

    return { id: record.id, token };
  });
}

export async function consumeAuthToken(
  tx: TransactionClient,
  token: string,
  type: typeof AppAuthToken.$inferInsert.type,
  options: { consumeSiblings?: boolean } = {},
) {
  const now = new Date();
  const [record] = await tx
    .update(AppAuthToken)
    .set({ consumedAt: now })
    .where(
      and(
        eq(AppAuthToken.tokenHash, hashAuthToken(token)),
        eq(AppAuthToken.type, type),
        isNull(AppAuthToken.consumedAt),
        gt(AppAuthToken.expiresAt, new Date()),
      ),
    )
    .returning();

  if (record && options.consumeSiblings) {
    await tx
      .update(AppAuthToken)
      .set({ consumedAt: now })
      .where(
        and(
          eq(AppAuthToken.type, record.type),
          eq(AppAuthToken.email, record.email),
          isNull(AppAuthToken.consumedAt),
        ),
      );
  }

  return record ?? null;
}

export async function getUsableAuthToken(
  token: string,
  type: typeof AppAuthToken.$inferInsert.type,
) {
  return (
    (await db.query.AppAuthToken.findFirst({
      where: (table, { and, eq, gt, isNull }) =>
        and(
          eq(table.tokenHash, hashAuthToken(token)),
          eq(table.type, type),
          isNull(table.consumedAt),
          gt(table.expiresAt, new Date()),
        ),
      columns: { id: true, email: true },
    })) ?? null
  );
}

export async function getUsableAuthTokenInTransaction(
  tx: TransactionClient,
  token: string,
  type: typeof AppAuthToken.$inferInsert.type,
) {
  return (
    (await tx.query.AppAuthToken.findFirst({
      where: (table, { and, eq, gt, isNull }) =>
        and(
          eq(table.tokenHash, hashAuthToken(token)),
          eq(table.type, type),
          isNull(table.consumedAt),
          gt(table.expiresAt, new Date()),
        ),
    })) ?? null
  );
}

export async function hasUsableAuthToken(
  token: string,
  type: typeof AppAuthToken.$inferInsert.type,
) {
  return Boolean(await getUsableAuthToken(token, type));
}
