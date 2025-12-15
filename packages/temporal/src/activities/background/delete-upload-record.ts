import { prisma } from '@letschurch/db';
import { client as esClient } from '@letschurch/elasticsearch';
import { ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { Context } from '@temporalio/activity';
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
    await prisma.uploadRecord.update({
      where: { id },
      data: { visibility: 'PRIVATE' },
    });
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

  try {
    activityLogger.info('Deleting from index lc_uploads_v2');
    await esClient.delete({
      index: 'lc_uploads_v2',
      id,
    });
    activityLogger.info('Done!');
    activityLogger.info('Deleting from index lc_transcripts');
    await esClient.delete({
      index: 'lc_transcripts',
      id,
    });
    activityLogger.info('Done!');
    activityLogger.info('Deleting from index lc_transcripts_v2');
    await esClient.delete({
      index: 'lc_transcripts_v2',
      id,
    });
    activityLogger.info('Done!');
  } catch (e) {
    activityLogger.error(`Error deleting from ElasticSearch: ${e}`);
    return false;
  }

  return true;
}

export async function deleteUploadRecordDb(id: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'deleteUploadRecordDb',
    context: { id },
  });
  activityLogger.info(`Deleting upload record from database for ${id}`);

  try {
    await prisma.uploadRecord.delete({ where: { id } });
  } catch (e) {
    activityLogger.info(`Error deleting from database: ${e}`);
    return false;
  }

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
