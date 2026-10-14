import { invariant } from 'es-toolkit';

import { uploadRecordLocation } from '../../storage/locate';
import { ffprobeSchema } from '../../util/zod';

export default async function getProbe(uploadRecordId: string) {
  const { ingest: ingestS3 } = await uploadRecordLocation(uploadRecordId);
  const file = await ingestS3.getObject(`${uploadRecordId}/probe.json`);
  const body = await file.Body?.transformToString();
  invariant(body, 'Probe data body is required');
  return ffprobeSchema.parse(JSON.parse(body));
}
