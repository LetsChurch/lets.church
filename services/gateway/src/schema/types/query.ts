import { getPublicBucketStorage } from '../../util/s3';
import builder from '../builder';

builder.queryType();

builder.queryField('stats', (t) =>
  t.field({
    type: builder.simpleObject('Stats', {
      fields: (f) => ({ storageBytes: f.field({ type: 'SafeInt' }) }),
    }),
    resolve: async () => {
      return { storageBytes: await getPublicBucketStorage() };
    },
  }),
);
