import { SignJWT } from 'jose';
import envariant from '@knpwrs/envariant';
import { createPresignedGetUrl } from '../util/s3';

const ASSEMBLY_AI_API_KEY = envariant('ASSEMBLY_AI_API_KEY');
const EXTERNAL_HOOKS_HOST = envariant('EXTERNAL_HOOKS_HOST');
const JWT_SECRET = Buffer.from(envariant('JWT_SECRET'), 'hex');

export default async function transcribeRequest(id: string) {
  const presignedGet = await createPresignedGetUrl(id);

  const jwt = await new SignJWT({ id })
    .setProtectedHeader({ alg: 'HS512' })
    .setIssuedAt()
    .setExpirationTime('1 hour')
    .sign(JWT_SECRET);

  const res = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      Authorization: ASSEMBLY_AI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: presignedGet,
      speaker_labels: true,
      language_detection: true,
      webhook_url: `${EXTERNAL_HOOKS_HOST}/transcript-done`,
      webhook_auth_header_name: 'Authorization',
      webhook_auth_header_value: `Bearer ${jwt}`,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}
