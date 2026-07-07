import { ingestS3 } from '@letschurch/s3/ingest';

import logger from '../../util/logger';
import { ffprobeSchema, type Probe } from '../../util/zod';

const moduleLogger = logger.child({
  module: 'activities/background/get-stored-probe',
});

/**
 * Null-safe variant of `getProbe`: read the `{id}/probe.json` artifact
 * persisted by the probe activity on the initial pipeline run and return
 * it as a validated `Probe`. Used by reprocess flows running with "skip
 * probe" so they can re-transcode without paying for a fresh download +
 * ffprobe.
 *
 * Unlike `getProbe` (which throws when the object is missing — fine for
 * `remakeThumbnailsWorkflow` where probe.json is guaranteed), this returns
 * `null` when the artifact is absent or fails schema validation so callers
 * can fall back to a live `probe()` for that upload instead of burning the
 * activity's retry budget.
 */
export async function getStoredProbe(
  uploadRecordId: string,
): Promise<Probe | null> {
  let body: string | undefined;
  try {
    const file = await ingestS3.getObject(`${uploadRecordId}/probe.json`);
    body = await file.Body?.transformToString();
  } catch (err) {
    moduleLogger.info(
      {
        uploadId: uploadRecordId,
        context: { error: err instanceof Error ? err.message : String(err) },
      },
      'Stored probe.json not readable; caller should fall back to live probe',
    );
    return null;
  }

  if (!body) {
    moduleLogger.info(
      { uploadId: uploadRecordId },
      'Stored probe.json empty; caller should fall back to live probe',
    );
    return null;
  }

  const parsed = ffprobeSchema.safeParse(safeJsonParse(body));
  if (!parsed.success) {
    moduleLogger.warn(
      { uploadId: uploadRecordId, context: { issues: parsed.error.issues } },
      'Stored probe failed schema validation; caller should fall back to live probe',
    );
    return null;
  }

  return parsed.data;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
