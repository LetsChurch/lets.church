import pAll from 'p-all';
import { round } from 'lodash-es';
import prisma from '../../../util/prisma';

const epoch = 1680145772760;

export default async function updateUploadScores() {
  const uploads = await prisma.uploadRecord.findMany({
    where: {
      scoreStaleAt: {
        not: null,
      },
    },
    select: {
      id: true,
      publishedAt: true,
      score: true,
    },
  });

  console.log(`Updating scores for ${uploads.length} uploads...`);

  await pAll(
    uploads.map(({ id, publishedAt, score: oldScore }) => async () => {
      await prisma.$transaction(async (tx) => {
        const [likes, dislikes] = await Promise.all([
          tx.uploadUserRating.count({
            where: { uploadRecordId: id, rating: 'LIKE' },
          }),
          tx.uploadUserRating.count({
            where: { uploadRecordId: id, rating: 'DISLIKE' },
          }),
        ]);

        const delta = likes - dislikes;
        const order = Math.log10(Math.max(Math.abs(delta), 1));
        const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0;
        const seconds = Math.round((publishedAt.getTime() - epoch) / 1000);

        const score = round(sign * order + seconds / 45000, 7);

        console.log(
          `Upload ${id} has score ${score} (old score: ${oldScore}) (likes: ${likes}, dislikes: ${dislikes})`,
        );

        await tx.uploadRecord.update({
          where: { id },
          data: { score, scoreStaleAt: null },
        });
      });
    }),
    { concurrency: 100 },
  );
}
