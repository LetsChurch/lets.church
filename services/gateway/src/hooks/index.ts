import envariant from '@knpwrs/envariant';
import camelcaseKeys from 'camelcase-keys';
import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { jwtVerify } from 'jose';
import * as Z from 'zod';
import { processTranscript } from '../temporal';

const JWT_SECRET = Buffer.from(envariant('JWT_SECRET'), 'hex');

const jwtSchema = Z.object({
  id: Z.string().uuid(),
});

const register: FastifyPluginCallback = (app, _opts, done) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/transcript-done',
    {
      schema: {
        body: Z.object({
          transcript_id: Z.string(), // NOT UUID
          status: Z.enum(['completed', 'error'] as const),
        }).transform((o) => camelcaseKeys(o)),
        response: {
          204: Z.null(),
        },
      },
    },
    async (req, reply) => {
      const jwt = req.headers.authorization?.split(' ')[1];

      if (!jwt) {
        return reply.status(401).send();
      }

      try {
        const { payload } = await jwtVerify(jwt, JWT_SECRET);
        const jwtPayload = jwtSchema.parse(payload);
        await processTranscript(jwtPayload.id, req.body);
      } catch (e) {
        return reply.status(401).send();
      }

      return reply.status(204).send();
    },
  );

  done();
};

export default register;
