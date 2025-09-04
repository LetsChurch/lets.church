import { z } from 'zod';

export const churchIdSchema = z.uuid();

export const churchQuerySchema = z.object({
  churchId: churchIdSchema,
});
