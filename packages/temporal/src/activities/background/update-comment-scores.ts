import { db, UploadUserComment, UploadUserCommentRating } from '@letschurch/db';
import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import pAll from 'p-all';

import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'temporal/activities/background/update-comment-scores',
});

function confidence(likes: number, dislikes: number): number {
  const n = likes + dislikes;

  if (n === 0) {
    return 0;
  }

  const z = 1.281551565545;
  const p = likes / n;

  const left = p + (1 / (2 * n)) * z ** 2;
  const right = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * n)) / n);
  const under = 1 + (1 / n) * z ** 2;

  return (left - right) / under;
}

export type CommentScoreUpdateHooks = {
  afterCountsRead?: (candidate: {
    id: string;
    likes: number;
    dislikes: number;
    scoreInvalidationVersion: number;
  }) => Promise<void> | void;
};

export async function updateCommentScoresForCandidates(
  candidateIds?: readonly string[],
  hooks: CommentScoreUpdateHooks = {},
) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'updateCommentScores',
  });

  const comments = await db
    .select({
      id: UploadUserComment.id,
      score: UploadUserComment.score,
      scoreInvalidationVersion: UploadUserComment.scoreInvalidationVersion,
    })
    .from(UploadUserComment)
    .where(
      candidateIds
        ? and(
            isNotNull(UploadUserComment.scoreStaleAt),
            inArray(UploadUserComment.id, candidateIds),
          )
        : isNotNull(UploadUserComment.scoreStaleAt),
    );

  activityLogger.info(`Updating scores for ${comments.length} comments...`);

  await pAll(
    comments.map(
      ({ id, score: oldScore, scoreInvalidationVersion }) =>
        async () => {
          const [likesResult, dislikesResult] = await Promise.all([
            db
              .select({
                count: count(UploadUserCommentRating.uploadUserCommentId),
              })
              .from(UploadUserCommentRating)
              .where(
                and(
                  eq(UploadUserCommentRating.uploadUserCommentId, id),
                  eq(UploadUserCommentRating.rating, 'LIKE'),
                ),
              )
              .then((r) => Number(r[0]?.count ?? 0)),
            db
              .select({
                count: count(UploadUserCommentRating.uploadUserCommentId),
              })
              .from(UploadUserCommentRating)
              .where(
                and(
                  eq(UploadUserCommentRating.uploadUserCommentId, id),
                  eq(UploadUserCommentRating.rating, 'DISLIKE'),
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

          const score = confidence(likes, dislikes);

          activityLogger.info(
            `Comment ${id} has score ${score} (old score: ${oldScore}) (likes: ${likes}, dislikes: ${dislikes})`,
          );

          const updated = await db
            .update(UploadUserComment)
            .set({ score, scoreStaleAt: null, updatedAt: new Date() })
            .where(
              and(
                eq(UploadUserComment.id, id),
                eq(
                  UploadUserComment.scoreInvalidationVersion,
                  scoreInvalidationVersion,
                ),
              ),
            )
            .returning({ id: UploadUserComment.id });

          if (updated.length === 0) {
            activityLogger.info(
              `Comment ${id} invalidation version changed from ${scoreInvalidationVersion} during recomputation`,
            );
          }
        },
    ),
    { concurrency: 100 },
  );
}

export default async function updateCommentScores() {
  await updateCommentScoresForCandidates();
}
