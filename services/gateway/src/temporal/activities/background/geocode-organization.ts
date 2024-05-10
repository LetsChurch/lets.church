import envariant from '@knpwrs/envariant';
import * as z from 'zod';
import prisma from '../../../util/prisma';
import logger from '../../../util/logger';

const MAPBOX_GEOCODING_TOKEN = envariant('MAPBOX_GEOCODING_TOKEN');

const moduleLogger = logger.child({
  module: 'temporal/activities/background/index-document',
});

export type DocumentKind =
  | 'transcript'
  | 'transcriptHtml'
  | 'upload'
  | 'organization'
  | 'channel';

// https://github.com/colinhacks/zod/discussions/2178#discussioncomment-5256971
// @see: https://github.com/colinhacks/zod#json-type
const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Literal = z.infer<typeof literalSchema>;
type Json = Literal | { [key: string]: Json } | Json[];
const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)]),
);

const geocodeResSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    features: z.array(
      z
        .object({
          id: z.string(),
          type: z.literal('Feature'),
          geometry: z
            .object({
              type: z.literal('Point'),
              coordinates: z.array(z.number()).length(2),
            })
            .and(jsonSchema),
          properties: z
            .object({
              mapbox_id: z.string(),
              feature_type: z.enum([
                'country',
                'region',
                'postcode',
                'district',
                'place',
                'locality',
                'neighborhood',
                'street',
                'address',
              ] as const),
              name: z.string(),
              name_preferred: z.string(),
              place_formatted: z.string(),
              full_address: z.string(),
              context: z.object({}).and(jsonSchema),
              coordinates: z
                .object({
                  longitude: z.number(),
                  latitude: z.number(),
                })
                .and(jsonSchema),
            })
            .and(jsonSchema),
        })
        .and(jsonSchema),
    ),
    attribution: z.string(),
  })
  .and(jsonSchema);

export default async function geocodeOrganization(organizationId: string) {
  const activityLogger = moduleLogger.child({
    temporalActivity: 'geocodeOrganization',
    args: {
      organizationId,
    },
  });

  const addresses = await prisma.organizationAddress.findMany({
    where: { organizationId, latitude: null, longitude: null },
  });

  let geocoded = 0;

  for (const address of addresses) {
    const q = encodeURIComponent(
      `${address.streetAddress}, ${address.locality}, ${address.region} ${address.postalCode}, ${address.country}`.replace(
        /;/g,
        '',
      ),
    );
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${q}&permanent=true&access_token=${MAPBOX_GEOCODING_TOKEN}`,
    );
    const json = await res.json();
    activityLogger.info({ meta: JSON.stringify({ json }) });

    const parsed = geocodeResSchema.parse(json);
    const [feature] = parsed.features;

    if (feature) {
      await prisma.organizationAddress.update({
        where: { id: address.id },
        data: {
          geocodingJson: parsed,
          latitude: feature.geometry.coordinates[1] ?? null,
          longitude: feature.geometry.coordinates[0] ?? null,
        },
      });

      geocoded += 1;
    }
  }

  activityLogger.info('Done!');

  return geocoded;
}
