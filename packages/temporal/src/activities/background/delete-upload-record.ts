import { db, UploadRecord } from '@letschurch/db';
import {
  client as esClient,
  MEDIA_INDEX,
  SPEAKER_VECTOR_INDEX,
} from '@letschurch/opensearch';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { Context } from '@temporalio/activity';
import { eq } from 'drizzle-orm';

import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/delete-upload-record',
});

export async function markUploadPrivate(id: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'markUploadPrivate',
    context: {
      args: {
        id,
      },
    },
  });
  activityLogger.info(`Marking upload record ${id} as private`);

  try {
    await db
      .update(UploadRecord)
      .set({ visibility: 'PRIVATE', updatedAt: new Date() })
      .where(eq(UploadRecord.id, id));
  } catch (e) {
    activityLogger.error(`Error marking upload record ${id} as private: ${e}`);
    return false;
  }

  return true;
}

export async function deleteUploadRecordSearch(id: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteUploadRecordSearch',
    context: { id },
  });

  // Remove the unified search doc (lc_media_v1; its _id is the upload id) and the
  // upload's speaker vectors (lc_speaker_vectors; keyed by the uploadRecordId
  // field, one doc per attributed label).
  activityLogger.info(`Deleting from index ${MEDIA_INDEX}`);
  await esClient.delete({ index: MEDIA_INDEX, id }, { ignore: [404] });
  await esClient.deleteByQuery({
    index: SPEAKER_VECTOR_INDEX,
    body: { query: { term: { uploadRecordId: id } } },
  });
  activityLogger.info('Done!');

  return true;
}

export async function deleteUploadRecordDb(id: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteUploadRecordDb',
    context: { id },
  });
  activityLogger.info(`Deleting upload record from database for ${id}`);

  await db.delete(UploadRecord).where(eq(UploadRecord.id, id));

  return true;
}

export async function deleteUploadRecordS3Objects(id: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteUploadRecordS3Objects',
    context: { id },
  });

  const ingestCount = await ingestS3.deletePrefix(id, () => {
    Context.current().heartbeat('deleteUploadRecordS3Objects: INGEST');
  });
  activityLogger.info(`Done deleting prefix ${id} from ingest bucket`);

  activityLogger.info(`Deleting prefix ${id} from public bucket`);
  const publicCount = await publicS3.deletePrefix(id, () =>
    Context.current().heartbeat('deleteUploadRecordS3Objects: PUBLIC'),
  );
  activityLogger.info(`Done deleting prefix ${id} from public bucket`);

  return [ingestCount, publicCount];
}
