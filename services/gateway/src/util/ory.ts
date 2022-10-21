import camelcaseKeys from 'camelcase-keys';
import * as z from 'zod';

export const userV0Schema = z
  .object({
    id: z.string().uuid(),
    traits: z.object({
      email: z.string().email(),
      username: z.string(),
      fullName: z.string(),
    }),
    verifiable_addresses: z.array(
      z.object({
        id: z.string().uuid(),
        value: z.string().email(),
        verified: z.boolean(),
      }),
    ),
    metadata_public: z.object({ role: z.enum(['user', 'admin'] as const) }),
  })
  .transform((o) => camelcaseKeys(o));

const aal = z.enum(['aal1', 'aal2', 'aal3'] as const);

export const sessionSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  authenticator_assurance_level: aal,
  authentication_methods: z.array(
    z.object({
      method: z.literal('password'),
      aal,
    }),
  ),
  identity: userV0Schema,
});

export const whoAmIErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    reason: z.string(),
    status: z.string(),
  }),
});

export const whoAmIResponse = z.union([sessionSchema, whoAmIErrorSchema]);
