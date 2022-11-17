import envariant from '@knpwrs/envariant';
import { createAssemblyAiJwt } from '../../../util/jwt';
import { createPresignedGetUrl } from '../../../util/s3';

const ASSEMBLY_AI_API_KEY = envariant('ASSEMBLY_AI_API_KEY');
const EXTERNAL_HOOKS_HOST = envariant('EXTERNAL_HOOKS_HOST');

export default async function transcribeRequest(uploadId: string) {
  const presignedGet = await createPresignedGetUrl(uploadId);

  const jwt = await createAssemblyAiJwt({ uploadId });

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
      webhook_url: `${EXTERNAL_HOOKS_HOST}/hooks/transcript-done`,
      webhook_auth_header_name: 'Authorization',
      webhook_auth_header_value: `Bearer ${jwt}`,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}
