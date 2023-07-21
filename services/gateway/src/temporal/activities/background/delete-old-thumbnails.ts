import all from 'it-all';
import filter from 'it-filter';
import { Context } from '@temporalio/activity';
import { throttle } from 'lodash-es';
import { deleteFile, listKeys } from '../../../util/s3';

export default async function deleteOldThumbnails(id: string) {
  const keys = await all(
    filter(listKeys('PUBLIC', id), (key) => /\d{5}\.jpg$/.test(key)),
  );

  const heartbeat = throttle(
    (key: string) => Context.current().heartbeat(`Deleted ${key}`),
    5000,
  );

  console.log(`Deleting ${keys.length} old thumbnails`);

  for (const key of keys) {
    await deleteFile('PUBLIC', key);
    heartbeat(key);
  }

  console.log(`Done deleting ${keys.length} old thumbnails`);
}
