import envariant from '@knpwrs/envariant';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import * as Z from 'zod';

const JWT_SECRET = envariant('JWT_SECRET');
const jwtSecret = Buffer.from(JWT_SECRET, 'hex');

function jwtFactory<S extends JWTPayload>(
  Schema: Z.Schema<S>,
  expires?: string,
) {
  return {
    create: (t: S, exp = expires) => {
      const jwt = new SignJWT(t)
        .setProtectedHeader({ alg: 'HS512' })
        .setIssuedAt();
      if (exp) {
        jwt.setExpirationTime(exp);
      }
      return jwt.sign(jwtSecret);
    },
    parse: async (jwt?: string): Promise<S | null> => {
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
