import { redirect } from '@tanstack/react-router';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { z } from 'zod';
import db from '@/util/db';
import { uuidTranslator } from '@/util/uuid';

const QuerySchema = z.object({
  userId: z.string(),
  emailId: z.string(),
  emailKey: z.string(),
});

export const ServerRoute = createServerFileRoute('/auth_/verify').methods({
  GET: async ({ request }) => {
    const url = new URL(request.url);

    try {
      const { userId, emailId, emailKey } = QuerySchema.parse(
        Object.fromEntries(
          ['userId', 'emailId', 'emailKey'].map((k) => [
            k,
            url.searchParams.get(k),
          ]),
        ),
      );

      // Convert short UUIDs back to full UUIDs
      const userIdFull = uuidTranslator.toUUID(userId);
      const emailIdFull = uuidTranslator.toUUID(emailId);
      const emailKeyFull = uuidTranslator.toUUID(emailKey);

      const result = await db.appUserEmail.updateMany({
        data: {
          verifiedAt: new Date(),
        },
        where: {
          id: emailIdFull,
          appUserId: userIdFull,
          key: emailKeyFull,
        },
      });

      if (result.count > 0) {
        // Email verified successfully
      } else {
        // Verification failed
      }

      return redirect({ to: '/' });
    } catch (_e) {
      // Invalid parameters or other error
      return redirect({ to: '/' });
    }
  },
});
