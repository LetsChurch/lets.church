import logger from '../../util/logger';
import { deleteBatchFile } from '../../util/openai-batch';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/cleanup-batch-files',
});

export type CleanupBatchFilesArgs = {
  fileIds: ReadonlyArray<string>;
};

// Best-effort delete of OpenAI batch-related files (input JSONL,
// output JSONL, error JSONL) once their batch's output has been
// processed. Input files don't auto-expire and count against the
// org's file-storage quota; output/error files are documented as
// 30-day TTL but cleaning up immediately keeps the Files list tidy
// across many reprocess runs.
//
// Failures are swallowed inside `deleteBatchFile` so a missing /
// already-expired file can't fail the activity. Deletes are fired in
// parallel since each is independent.
export default async function cleanupBatchFiles(
  args: CleanupBatchFilesArgs,
): Promise<{ deleted: number }> {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'cleanupBatchFiles',
    context: { args },
  });
  if (args.fileIds.length === 0) {
    return { deleted: 0 };
  }
  await Promise.all(args.fileIds.map((id) => deleteBatchFile(id)));
  activityLogger.info(`Issued delete for ${args.fileIds.length} batch file(s)`);
  return { deleted: args.fileIds.length };
}
