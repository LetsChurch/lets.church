import * as Z from 'zod';
import envariant from '@knpwrs/envariant';
import { jwtVerify } from 'jose';
import camelcaseKeys from 'camelcase-keys';

const JWT_SECRET = Buffer.from(envariant('JWT_SECRET'), 'hex');
const TEMPORAL_CLIENT_URL = envariant('TEMPORAL_CLIENT_URL');

const jwtSchema = Z.object({
  id: Z.string().uuid(),
});

const assemblyAiPayloadSchema = Z.object({
  transcript_id: Z.string(), // NOT UUID
  status: Z.enum(['completed', 'error'] as const),
}).transform((o) => camelcaseKeys(o));

export default eventHandler(async (event) => {
  const authorizationHeader = getHeader(event, 'Authorization');
  const jwt = [].concat(authorizationHeader)[0].split(' ')[1];
  const { payload } = await jwtVerify(jwt, JWT_SECRET);
  const jwtPayload = jwtSchema.parse(payload);
  const body = await useBody(event);
  const assemblyAiPayload = assemblyAiPayloadSchema.parse(body);

  console.log({ authorizationHeader, jwt, jwtPayload, assemblyAiPayload });

  const res = await fetch(
    `${TEMPORAL_CLIENT_URL}/process-transcript/${jwtPayload.id}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(assemblyAiPayload),
    },
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  // Respond 204
  return null;
});
