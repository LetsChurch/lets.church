import camelcaseKeys from 'camelcase-keys';
import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import invariant from 'tiny-invariant';
import * as Z from 'zod';
import { processTranscript } from '../temporal';
import { parseAssemblyAiJwt } from '../util/jwt';

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
        const jwtPayload = await parseAssemblyAiJwt(jwt);
        invariant(jwtPayload, 'Missing JWT Payload!');
        await processTranscript(jwtPayload.uploadId, req.body);
      } catch (e) {
        return reply.status(401).send();
      }

      return reply.status(204).send();
    },
  );

  done();
};

export default register;
