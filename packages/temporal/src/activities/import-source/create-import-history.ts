import { prisma } from '@letschurch/db';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'activity/create-import-history',
});

export type CreateImportHistoryParams = {
  importSourceId: string;
  uploadRecordId: string | null;
  title: string;
  description?: string;
  url: string;
  publishedAt: Date;
};

/**
 * Create an ImportHistory record for a successfully imported item.
 */
export async function createImportHistory(
  params: CreateImportHistoryParams,
): Promise<void> {
  await prisma.importHistory.create({
    data: {
      importSourceId: params.importSourceId,
      uploadRecordId: params.uploadRecordId,
      title: params.title,
      description: params.description || null,
      url: params.url,
      publishedAt: params.publishedAt,
    },
  });

  moduleLogger.info('Created import history record', {
    importSourceId: params.importSourceId,
    uploadRecordId: params.uploadRecordId,
    title: params.title,
  });
}
