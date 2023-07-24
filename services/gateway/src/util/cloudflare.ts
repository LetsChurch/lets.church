import pMem from 'p-memoize';
import ExpiryMap from 'expiry-map';
import { z } from 'zod';
import envariant from '@knpwrs/envariant';

const S3_PUBLIC_BUCKET = envariant('S3_PUBLIC_BUCKET');
const CLOUDFLARE_ACCOUNT_ID = envariant('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_AUTH_EMAIL = envariant('CLOUDFLARE_AUTH_EMAIL');
const CLOUDFLARE_AUTH_KEY = envariant('CLOUDFLARE_AUTH_KEY');

const cfUsageResSchema = z.object({
  success: z.literal(true),
  result: z.object({ payloadSize: z.string() }),
});

const cache = new ExpiryMap(1000 * 60 * 60);

export const getPublicBucketStorage = pMem(
  async () => {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${S3_PUBLIC_BUCKET}/usage`,
        {
          headers: {
            'X-Auth-Email': CLOUDFLARE_AUTH_EMAIL,
            'X-Auth-Key': CLOUDFLARE_AUTH_KEY,
          },
        },
      );
      const parsed = cfUsageResSchema.parse(await res.json());

      return parseInt(parsed.result.payloadSize, 10);
    } catch (e) {
      console.log(`Error fetching: ${e}`);

      return NaN;
    }
  },
  {
    cache,
  },
);
