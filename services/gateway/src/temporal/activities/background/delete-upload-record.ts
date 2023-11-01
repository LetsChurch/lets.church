import { Context } from '@temporalio/activity';
import prisma from '../../../util/prisma';
import { client as esClient } from '../../../util/elasticsearch';
import { deletePrefix } from '../../../util/s3';
import logger from '../../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/delete-upload-record',
});

export async function markUploadPrivate(id: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'markUploadPrivate',
    args: {
      id,
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
    id,
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
    id,
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
    id,
  });

  const ingestCount = await deletePrefix('INGEST', id, () => {
    Context.current().heartbeat('deleteUploadRecordS3Objects: INGEST');
  });
  activityLogger.info(`Done deleting prefix ${id} from ingest bucket`);

  activityLogger.info(`Deleting prefix ${id} from public bucket`);
  const publicCount = await deletePrefix('PUBLIC', id, () =>
    Context.current().heartbeat('deleteUploadRecordS3Objects: PUBLIC'),
  );
  activityLogger.info(`Done deleting prefix ${id} from public bucket`);

  return [ingestCount, publicCount];
}
