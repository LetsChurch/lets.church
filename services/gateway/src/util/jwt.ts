import envariant from '@knpwrs/envariant';
import { SignJWT, jwtVerify } from 'jose';
import * as Z from 'zod';
import type { ZodTypeAny } from 'zod';

const JWT_SECRET = envariant('JWT_SECRET');
const jwtSecret = Buffer.from(JWT_SECRET, 'hex');

function jwtFactory<S extends ZodTypeAny>(Schema: S, expires?: string) {
  type T = Z.infer<S>;
  return {
    create: (t: T, exp = expires) => {
      const jwt = new SignJWT(t)
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuedAt();
      if (exp) {
        jwt.setExpirationTime(exp);
      }
      return jwt.sign(jwtSecret);
    },
    parse: async (jwt?: string): Promise<T | null> => {
      try {
        return jwt
          ? Schema.parse(
              (await jwtVerify(jwt, jwtSecret, { algorithms: ['HS512'] }))
                .payload,
            )
          : null;
      } catch (e) {
        // Expired or invalid
        return null;
      }
    },
  };
}

const SessionJwtSchema = Z.object({
  sub: Z.string().uuid(),
});

export const { create: createSessionJwt, parse: parseSessionJwt } = jwtFactory(
  SessionJwtSchema,
  '2w',
);
