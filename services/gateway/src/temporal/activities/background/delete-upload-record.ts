import { Context } from '@temporalio/activity';
import prisma from '../../../util/prisma';
import { client as esClient } from '../../../util/elasticsearch';
import { deletePrefix } from '../../../util/s3';

export async function markUploadPrivate(id: string) {
  console.log(`Marking upload record ${id} as private`);

  try {
    await prisma.uploadRecord.update({
      where: { id },
      data: { visibility: 'PRIVATE' },
    });
  } catch (e) {
    console.log(`Error marking upload record ${id} as private: ${e}`);
    return false;
  }

  return true;
}

export async function deleteUploadRecordSearch(id: string) {
  console.log(`Deleting upload record search entry for ${id}`);

  try {
    await esClient.delete({
      index: 'lc_uploads',
      id,
    });
  } catch (e) {
    console.log(`Error deleting from ElasticSearch: ${e}`);
    return false;
  }

  return true;
}

export async function deleteUploadRecordDb(id: string) {
  console.log(`Deleting upload record from database for ${id}`);

  try {
    await prisma.uploadRecord.delete({ where: { id } });
  } catch (e) {
    console.log(`Error deleting from database: ${e}`);
    return false;
  }

  return true;
}

export async function deleteUploadRecordS3Objects(id: string) {
  console.log(`Deleting prefix ${id} from ingest bucket`);
  const ingestCount = await deletePrefix('INGEST', id, () =>
    Context.current().heartbeat('deleteUploadRecordS3Objects: INGEST'),
  );
  console.log(`Done deleting prefix ${id} from ingest bucket`);

  console.log(`Deleting prefix ${id} from public bucket`);
  const publicCount = await deletePrefix('PUBLIC', id, () =>
    Context.current().heartbeat('deleteUploadRecordS3Objects: PUBLIC'),
  );
  console.log(`Done deleting prefix ${id} from public bucket`);

  return [ingestCount, publicCount];
}
