import { db, UploadRecord, UploadUserRating } from '@letschurch/db';
import { and, count, eq, isNotNull } from 'drizzle-orm';
import { round } from 'es-toolkit';
import pAll from 'p-all';
import logger from '../../util/logger';

const epoch = 1680145772760;

const moduleLogger = logger.child({
  module: 'temporal/activities/background/update-upload-score',
});

export default async function updateUploadScores() {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'processImage',
  });

  const uploads = await db
    .select({
      id: UploadRecord.id,
      publishedAt: UploadRecord.publishedAt,
      score: UploadRecord.score,
    })
    .from(UploadRecord)
    .where(isNotNull(UploadRecord.scoreStaleAt));

  activityLogger.info(`Updating scores for ${uploads.length} uploads...`);

  await pAll(
    uploads.map(({ id, publishedAt, score: oldScore }) => async () => {
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

      const delta = likes - dislikes;
      const order = Math.log10(Math.max(Math.abs(delta), 1));
      const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0;
      const seconds = Math.round((publishedAt.getTime() - epoch) / 1000);

      const score = round(sign * order + seconds / 45000, 7);

      activityLogger.info(
        `Upload ${id} has score ${score} (old score: ${oldScore}) (likes: ${likes}, dislikes: ${dislikes})`,
      );

      await db
        .update(UploadRecord)
        .set({ score, scoreStaleAt: null, updatedAt: new Date() })
        .where(eq(UploadRecord.id, id));
    }),
    { concurrency: 100 },
  );
}
