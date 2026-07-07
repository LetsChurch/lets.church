import waitOn from 'wait-on';
import { z } from 'zod';

import {
  type UploadRecordUpdateData,
  updateUploadRecord as updateUploadRecordClient,
} from '../client';
import logger from './logger';

const moduleLogger = logger.child({ module: 'temporal' });

const { TEMPORAL_ADDRESS } = z
  .object({ TEMPORAL_ADDRESS: z.string() })
  .parse(process.env);

export async function waitOnTemporal() {
  moduleLogger.info('Waiting for Temporal');

  await waitOn({
    resources: [`tcp:${TEMPORAL_ADDRESS}`],
  });

  moduleLogger.info('Temporal is available!');
}

export async function updateUploadRecord(
  uploadRecordId: string,
  data: UploadRecordUpdateData,
) {
  return updateUploadRecordClient(uploadRecordId, data);
}
