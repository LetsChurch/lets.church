import { invariant } from 'es-toolkit';
import { getObject } from '../../../util/s3';
import { ffprobeSchema } from '../../../util/zod';

export default async function getProbe(uploadRecordId: string) {
  const file = await getObject('INGEST', `${uploadRecordId}/probe.json`);
  const body = await file.Body?.transformToString();
  invariant(body, 'Probe data body is required');
  return ffprobeSchema.parse(JSON.parse(body));
}
