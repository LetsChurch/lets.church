import ExpiryMap from 'expiry-map';
import pMem from 'p-memoize';
import { getPublicBucketStorage } from '../../util/cloudflare';
import prisma from '../../util/prisma';
import builder from '../builder';

builder.queryType();

const cache = new ExpiryMap(1000 * 60 * 60);

const getUploadCount = pMem(
  async () => {
    return prisma.uploadRecord.count({ where: { visibility: 'PUBLIC' } });
  },
  { cache },
);

builder.queryField('stats', (t) =>
  t.field({
    type: builder.simpleObject('Stats', {
      fields: (f) => ({
        storageBytes: f.field({ type: 'SafeInt' }),
        totalUploads: f.field({ type: 'Int' }),
      }),
    }),
    resolve: async () => {
      const [storageBytes, totalUploads] = await Promise.all([
        getPublicBucketStorage(),
        getUploadCount(),
      ]);

      return {
        storageBytes,
        totalUploads,
      };
    },
  }),
);
