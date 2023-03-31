import pAll from 'p-all';
import prisma from '../../../util/prisma';

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

export default async function updateCommentScores() {
  const comments = await prisma.uploadUserComment.findMany({
    where: {
      scoreStaleAt: {
        not: null,
      },
    },
    select: {
      id: true,
      score: true,
    },
  });

  console.log(`Updating scores for ${comments.length} comments...`);

  await pAll(
    comments.map(({ id, score: oldScore }) => async () => {
      await prisma.$transaction(async (tx) => {
        const [likes, dislikes] = await Promise.all([
          tx.uploadUserCommentRating.count({
            where: { uploadUserCommentId: id, rating: 'LIKE' },
          }),
          tx.uploadUserCommentRating.count({
            where: { uploadUserCommentId: id, rating: 'DISLIKE' },
          }),
        ]);

        const score = confidence(likes, dislikes);

        console.log(
          `Comment ${id} has score ${score} (old score: ${oldScore}) (likes: ${likes}, dislikes: ${dislikes})`,
        );

        await tx.uploadUserComment.update({
          where: { id },
          data: { score, scoreStaleAt: null },
        });
      });
    }),
    { concurrency: 100 },
  );
}
