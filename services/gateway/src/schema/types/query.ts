import ExpiryMap from 'expiry-map';
import pMem from 'p-memoize';
import prisma from '../../util/prisma';
import builder from '../builder';

builder.queryType();

const cache = new ExpiryMap(1000 * 60 * 60);

const getUploadSeconds = pMem(async () => {
  return prisma.uploadRecord.aggregate({
    _sum: { lengthSeconds: true },
    where: {
      visibility: 'PUBLIC',
      channel: { visibility: 'PUBLIC' },
      transcodingFinishedAt: { not: null },
      transcribingFinishedAt: { not: null },
    },
  });
});

const getUploadCount = pMem(
  async () => {
    return prisma.uploadRecord.count({
      where: {
        visibility: 'PUBLIC',
        transcodingFinishedAt: { not: null },
        transcribingFinishedAt: { not: null },
        channel: { visibility: 'PUBLIC' },
      },
    });
  },
  { cache },
);

builder.queryField('stats', (t) =>
  t.field({
    type: builder.simpleObject('Stats', {
      fields: (f) => ({
        totalUploadSeconds: f.field({ type: 'Float' }),
        totalUploads: f.field({ type: 'Int' }),
      }),
    }),
    resolve: async () => {
      const [
        {
          _sum: { lengthSeconds },
        },
        totalUploads,
      ] = await Promise.all([getUploadSeconds(), getUploadCount()]);

      return {
        totalUploadSeconds: lengthSeconds ?? 0,
        totalUploads,
      };
    },
  }),
);
