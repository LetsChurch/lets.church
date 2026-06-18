import type { StandardSchemaV1 } from '@standard-schema/spec';
import { type JWTPayload, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

const { JWT_SECRET } = z.object({ JWT_SECRET: z.string() }).parse(process.env);
// Session cookies derive their HS512 key by decoding JWT_SECRET as HEX. This is
// intentionally a different derivation than download-URL signing, which uses the
// raw UTF-8 bytes (see util/server-env.ts). Keep them separate.
const jwtSecret = Buffer.from(JWT_SECRET, 'hex');

function jwtFactory<T extends StandardSchemaV1<JWTPayload>>(
  schema: T,
  expires?: string,
) {
  return {
    create: (input: StandardSchemaV1.InferInput<T>, exp = expires) => {
      const jwt = new SignJWT(input)
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuedAt();
      if (exp) {
        jwt.setExpirationTime(exp);
      }
      return jwt.sign(jwtSecret);
    },
    parse: async (
      jwt?: string,
    ): Promise<StandardSchemaV1.InferOutput<T> | null> => {
      if (!jwt) {
        return null;
      }

      try {
        const input = (
          await jwtVerify(jwt, jwtSecret, { algorithms: ['HS512'] })
        ).payload;
        let result = schema['~standard'].validate(input);
        if (result instanceof Promise) result = await result;

        // if the `issues` field exists, the validation failed
        if (result.issues) {
          throw new Error(JSON.stringify(result.issues, null, 2));
        }

        return result.value;
      } catch {
        // Expired or invalid TODO: verify error from jose
        return null;
      }
    },
  };
}

const sessionJwtSchema = z.object({
  sub: z.uuid(),
});

// 4 weeks in seconds
export const SESSION_EXPIRATION_SECONDS = 60 * 60 * 24 * 7 * 4;

export const { create: createSessionJwt, parse: parseSessionJwt } = jwtFactory(
  sessionJwtSchema,
  `${SESSION_EXPIRATION_SECONDS}s`,
);
