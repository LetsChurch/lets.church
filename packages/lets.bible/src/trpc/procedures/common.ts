import { z } from 'zod';

import { authHost } from '@/server/oidc';
import {
  type Preferences,
  resolvePreferences,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  writePreferences,
} from '@/server/preferences';

import type { Context } from '../context';
import { publicProcedure } from '../trpc';

function subOf(ctx: Context): string | undefined {
  const sub = ctx.session?.claims?.sub;
  return typeof sub === 'string' && sub ? sub : undefined;
}

export const commonProcedures = {
  hasValidSession: publicProcedure.query(({ ctx }): boolean =>
    Boolean(ctx.session),
  ),

  // The account/auth host (where sign-in happens) so the UI can link back to it.
  authHost: publicProcedure.query((): string => authHost),

  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.session) {
      return null;
    }
    const c = ctx.session.claims;
    // A session without a valid `sub` is a broken token, not a real user.
    if (typeof c.sub !== 'string' || !c.sub) {
      return null;
    }
    return {
      sub: c.sub,
      name: typeof c.name === 'string' ? c.name : null,
      preferredUsername:
        typeof c.preferred_username === 'string' ? c.preferred_username : null,
      email: typeof c.email === 'string' ? c.email : null,
    };
  }),

  // Effective reading preferences (DB for signed-in, else cookie, else default).
  preferences: publicProcedure.query(
    ({ ctx }): Promise<Preferences> => resolvePreferences(subOf(ctx), ctx.req),
  ),

  // Update preferences: persist to the DB (signed-in) + set the lb-prefs cookie.
  setPreferences: publicProcedure
    .input(
      z.object({
        translation: z.string().nullable().optional(),
        redLetter: z.boolean().optional(),
        verseNumbers: z.boolean().optional(),
        textSize: z
          .number()
          .int()
          .min(TEXT_SIZE_MIN)
          .max(TEXT_SIZE_MAX)
          .optional(),
        divineName: z.enum(['lord', 'yhwh', 'yahweh']).optional(),
        sourceOverlay: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<Preferences> => {
      const current = await resolvePreferences(subOf(ctx), ctx.req);
      const next: Preferences = {
        translation:
          input.translation !== undefined
            ? input.translation
            : current.translation,
        redLetter: input.redLetter ?? current.redLetter,
        verseNumbers: input.verseNumbers ?? current.verseNumbers,
        textSize: input.textSize ?? current.textSize,
        divineName: input.divineName ?? current.divineName,
        sourceOverlay: input.sourceOverlay ?? current.sourceOverlay,
      };
      const cookie = await writePreferences(subOf(ctx), next);
      ctx.resHeaders.append('set-cookie', cookie);
      return next;
    }),
};
