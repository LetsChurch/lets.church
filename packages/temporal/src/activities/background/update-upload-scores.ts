import { db, UploadRecord, UploadUserRating } from '@letschurch/db';
import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { round } from 'es-toolkit';
import pAll from 'p-all';

import logger from '../../util/logger';

const epoch = 1680145772760;

const moduleLogger = logger.child({
  module: 'temporal/activities/background/update-upload-score',
});

export type UploadScoreUpdateHooks = {
  afterCountsRead?: (candidate: {
    id: string;
    likes: number;
    dislikes: number;
    scoreInvalidationVersion: number;
  }) => Promise<void> | void;
};

export async function updateUploadScoresForCandidates(
  candidateIds?: readonly string[],
  hooks: UploadScoreUpdateHooks = {},
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'processImage',
  });

  const uploads = await db
    .select({
      id: UploadRecord.id,
      publishedAt: UploadRecord.publishedAt,
      score: UploadRecord.score,
      scoreInvalidationVersion: UploadRecord.scoreInvalidationVersion,
    })
    .from(UploadRecord)
    .where(
      candidateIds
        ? and(
            isNotNull(UploadRecord.scoreStaleAt),
            inArray(UploadRecord.id, candidateIds),
          )
        : isNotNull(UploadRecord.scoreStaleAt),
    );

  activityLogger.info(`Updating scores for ${uploads.length} uploads...`);

  await pAll(
    uploads.map(
      ({ id, publishedAt, score: oldScore, scoreInvalidationVersion }) =>
        async () => {
          const [likesResult, dislikesResult] = await Promise.all([
            db
              .select({ count: count(UploadUserRating.uploadRecordId) })
              .from(UploadUserRating)
              .where(
                and(
                  eq(UploadUserRating.uploadRecordId, id),
                  eq(UploadUserRating.rating, 'LIKE'),
                ),
              )
              .then((r) => Number(r[0]?.count ?? 0)),
            db
              .select({ count: count(UploadUserRating.uploadRecordId) })
              .from(UploadUserRating)
              .where(
                and(
                  eq(UploadUserRating.uploadRecordId, id),
                  eq(UploadUserRating.rating, 'DISLIKE'),
                ),
              )
              .then((r) => Number(r[0]?.count ?? 0)),
          ]);

          const likes = likesResult;
          const dislikes = dislikesResult;

          await hooks.afterCountsRead?.({
            id,
            likes,
            dislikes,
            scoreInvalidationVersion,
          });

          const delta = likes - dislikes;
          const order = Math.log10(Math.max(Math.abs(delta), 1));
          const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0;
          const seconds = Math.round((publishedAt.getTime() - epoch) / 1000);

          const score = round(sign * order + seconds / 45000, 7);

          activityLogger.info(
            `Upload ${id} has score ${score} (old score: ${oldScore}) (likes: ${likes}, dislikes: ${dislikes})`,
          );

          const updated = await db
            .update(UploadRecord)
            .set({ score, scoreStaleAt: null, updatedAt: new Date() })
            .where(
              and(
                eq(UploadRecord.id, id),
                eq(
                  UploadRecord.scoreInvalidationVersion,
                  scoreInvalidationVersion,
                ),
              ),
            )
            .returning({ id: UploadRecord.id });

          if (updated.length === 0) {
            activityLogger.info(
              `Upload ${id} invalidation version changed from ${scoreInvalidationVersion} during recomputation`,
            );
          }
        },
    ),
    { concurrency: 100 },
  );
}

export default async function updateUploadScores() {
  await updateUploadScoresForCandidates();
}
