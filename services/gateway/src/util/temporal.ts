import envariant from '@knpwrs/envariant';
import type { JsonValue } from 'type-fest';

const TEMPORAL_CLIENT_URL = envariant('TEMPORAL_CLIENT_URL');

export async function submitJob(endpoint: string, payload: JsonValue) {
  console.log({ TEMPORAL_CLIENT_URL, endpoint });
  return fetch(`${TEMPORAL_CLIENT_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function processUpload(id: string, url: string) {
  return submitJob('process-upload', { id, url });
}
