import envariant from '@knpwrs/envariant';
import camelcaseKeys from 'camelcase-keys';
import * as z from 'zod';

const PS_API_URL = envariant('MAPBOX_GEOCODING_TOKEN');
const PS_BASE_PARAMS = {
  access_key: envariant('MAPBOX_GEOCODING_TOKEN'),
  output: 'json',
};

export const geocodeResultSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.string(),
  confidence: z.number(),
  latitude: z.number(),
  longitude: z.number(),
  number: z.string().nullable(),
  postalCode: z.string().nullable(),
  street: z.string().nullable(),
  region: z.string().nullable(),
  regionCode: z.string().nullable(),
  county: z.string().nullable(),
  locality: z.string().nullable(),
  administrativeArea: z.string().nullable(),
  neighborhood: z.string().nullable(),
  country: z.string().nullable(),
  countryCode: z.string().nullable(),
  continent: z.string().nullable(),
});

const serviceResultSchema = z
  .object({
    data: z.array(
      z
        .object({
          name: z.string(),
          label: z.string(),
          type: z.string(),
          confidence: z.number(),
          latitude: z.number(),
          longitude: z.number(),
          number: z.string().nullable(),
          postal_code: z.string().nullable(),
          street: z.string().nullable(),
          region: z.string().nullable(),
          region_code: z.string().nullable(),
          county: z.string().nullable(),
          locality: z.string().nullable(),
          administrative_area: z.string().nullable(),
          neighbourhood: z.string().nullable(),
          country: z.string().nullable(),
          country_code: z.string().nullable(),
          continent: z.string().nullable(),
        })
        .transform(({ neighbourhood, ...rest }) => ({
          ...camelcaseKeys(rest),
          neighborhood: neighbourhood,
        })),
    ),
  })
  .or(z.object({ error: z.object({ code: z.string(), message: z.string() }) }));

export async function geocode(query: string) {
  const url = new URL(`${PS_API_URL}/v1/forward`);
  url.search = new URLSearchParams({ ...PS_BASE_PARAMS, query }).toString();

  const res = await fetch(url);
  const json = await res.json();

  return serviceResultSchema.parse(json);
}
