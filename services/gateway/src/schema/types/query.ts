import ExpiryMap from 'expiry-map';
import pMem from 'p-memoize';
import prisma from '../../util/prisma';
import builder from '../builder';
import { geocode } from '../../util/geo';
import { createGeocodeJwt } from '../../util/jwt';

builder.queryType();

const cache = new ExpiryMap(1000 * 60 * 60);

const getUploadSeconds = pMem(async () => {
  return prisma.uploadRecord.aggregate({
    _sum: { lengthSeconds: true },
    where: {
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

builder.queryField('geocode', (t) =>
  t.field({
    type: [
      builder.simpleObject('GeocodeResult', {
        fields: (f) => ({
          name: f.string(),
          label: f.string(),
          type: f.string(),
          latitude: f.float(),
          longitude: f.float(),
          number: f.string({ nullable: true }),
          postalCode: f.string({ nullable: true }),
          street: f.string({ nullable: true }),
          confidence: f.float(),
          region: f.string(),
          regionCode: f.string(),
          county: f.string({ nullable: true }),
          locality: f.string({ nullable: true }),
          administrativeArea: f.string({ nullable: true }),
          neighborhood: f.string({ nullable: true }),
          country: f.string(),
          countryCode: f.string(),
          continent: f.string(),
        }),
      }),
    ],
    args: { query: t.arg.string({ required: true }) },
    // TODO: rate limit
    resolve: async (_root, { query }) => {
      const res = await geocode(query);

      if ('data' in res) {
        return res.data;
      }

      return [];
    },
  }),
);

builder.queryField('geocodeJwt', (t) =>
  t.field({
    type: ['Jwt'],
    args: { query: t.arg.string({ required: true }) },
    authScopes: { authenticated: true },
    // TODO: rate limit
    resolve: async (_root, { query }) => {
      const res = await geocode(query);

      if ('data' in res) {
        return res.data.map((obj) => createGeocodeJwt(obj));
      }

      return [];
    },
  }),
);
