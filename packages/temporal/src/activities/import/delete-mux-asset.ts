import logger from '../../util/logger';
import { getMux } from '../../util/mux';

const moduleLogger = logger.child({
  module: 'temporal/activities/import/delete-mux-asset',
});

// Delete a Mux asset once we've fully imported + transcoded its recording onto
// our own CDN — at that point the Mux copy is redundant (we keep the original
// in ingest S3) and only accrues Mux storage cost. Tolerates an already-deleted
// asset (404) so a workflow re-run after a successful import doesn't fail here.
export default async function deleteMuxAsset(muxAssetId: string) {
  try {
    await getMux().video.assets.delete(muxAssetId);
    moduleLogger.info({ context: { muxAssetId } }, 'Deleted Mux asset');
  } catch (error) {
    if ((error as { status?: number })?.status === 404) {
      moduleLogger.info(
        { context: { muxAssetId } },
        'Mux asset already deleted',
      );
      return;
    }
    throw error;
  }
}
