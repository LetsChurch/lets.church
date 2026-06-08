import { Channel, db, UploadRecord } from '@letschurch/db';
import {
  MSearchResponseSchema,
  msearchOrganizations,
  osMsearch,
} from '@letschurch/opensearch';
import { publicS3 } from '@letschurch/s3/public';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import {
  organizationAvatarLarge,
  organizationAvatarMedium,
  organizationAvatarSmall,
  organizationAvatarTiny,
} from '@/util/image-sizes';
import logger from '@/util/logger';
import { isChannelRoutable } from '@/util/media-visibility';
import { formatPhoneNumber } from '@/util/phone';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/church',
});

const churchSearchSchema = z.object({
  lon: z.number(),
  lat: z.number(),
  range: z.string().default('50mi'),
  organizationId: IncomingIdSchema.optional().nullable(),
  organizationSlug: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  limit: z.number().min(1).max(1000).default(1000),
});

const ministriesSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(50).default(10),
});

const organizationByIdSchema = z.object({
  id: IncomingIdSchema,
});

const organizationBySlugSchema = z.object({
  slug: z.string(),
});

export const churchProcedures = {
  searchChurches: publicProcedure
    .input(churchSearchSchema)
    .query(async ({ input }) => {
      const { lon, lat, range, organizationId, organizationSlug, tags, limit } =
        input;

      // Resolve organization slug to ID if provided
      let resolvedOrganizationId = organizationId;
      if (organizationSlug && !organizationId) {
        const org = await db.query.Organization.findFirst({
          where: (t, { eq }) => eq(t.slug, organizationSlug),
          columns: { id: true },
        });
        if (org) {
          resolvedOrganizationId = org.id;
        }
      }

      moduleLogger.info(
        {
          ...(resolvedOrganizationId
            ? { organizationId: resolvedOrganizationId }
            : {}),
          context: {
            lat,
            lon,
            range,
            tagCount: tags?.length ?? 0,
            limit,
          },
        },
        'Searching for churches',
      );

      // Perform the search using ElasticSearch
      const searches = msearchOrganizations('', 0, limit, {
        orgType: 'CHURCH',
        geo: { range, lat, lon },
        organization: resolvedOrganizationId ?? null,
        tags: tags ?? null,
      });

      const response = await osMsearch(searches);

      const parsed = MSearchResponseSchema.parse(response);
      const [organizationsResponse] = parsed.responses;

      moduleLogger.info(
        {
          context: {
            resultsCount: organizationsResponse?.hits.total.value ?? 0,
          },
        },
        'Church search completed',
      );

      // Extract organization IDs from hits
      const organizationIds = organizationsResponse.hits.hits
        .filter((hit) => hit._index === 'lc_organizations')
        .map((hit) => hit._id);

      // Fetch full organization data from database
      const organizations =
        organizationIds.length > 0
          ? await db.query.Organization.findMany({
              columns: {
                id: true,
                slug: true,
                type: true,
                name: true,
                description: true,
                avatarPath: true,
                primaryEmail: true,
                primaryPhoneNumber: true,
                websiteUrl: true,
              },
              with: {
                addresses: {
                  columns: {
                    country: true,
                    locality: true,
                    region: true,
                    streetAddress: true,
                    postOfficeBoxNumber: true,
                    postalCode: true,
                    latitude: true,
                    longitude: true,
                    type: true,
                  },
                },
                tags: {
                  columns: {},
                  with: {
                    tag: {
                      columns: {
                        category: true,
                        color: true,
                        label: true,
                        slug: true,
                      },
                    },
                  },
                },
              },
              // Exclude pending/unapproved organizations from public search
              // results even if they were indexed.
              where: (t, { and, inArray, eq, isNotNull }) =>
                and(
                  inArray(t.id, organizationIds),
                  eq(t.type, 'CHURCH'),
                  isNotNull(t.approvedAt),
                ),
            })
          : [];

      // Create a map for quick lookup and preserve order
      const organizationsMap = new Map(organizations.map((o) => [o.id, o]));

      const items = organizationIds
        .map((id) => organizationsMap.get(id))
        .filter((org): org is NonNullable<typeof org> => Boolean(org))
        .map((org) => ({
          ...org,
          id: OutgoingIdSchema.parse(org.id),
          avatarUrl: org.avatarPath
            ? getPublicImageUrl(publicS3.getS3ProtocolUri(org.avatarPath), {
                resize: organizationAvatarMedium,
              })
            : null,
          // Filter to only MEETING addresses
          addresses: org.addresses.filter((a) => a.type === 'MEETING'),
          tags: org.tags.map((t) => t.tag),
        }));

      moduleLogger.info(
        {
          context: {
            organizationsRequested: organizationIds.length,
            organizationsFound: items.length,
          },
        },
        'Fetched church data from database',
      );

      return {
        items,
        total: organizationsResponse?.hits.total.value ?? 0,
      };
    }),

  searchMinistries: publicProcedure
    .input(ministriesSearchSchema)
    .query(async ({ input }) => {
      const { query, limit } = input;

      moduleLogger.info(
        {
          context: {
            query,
            limit,
          },
        },
        'Searching for ministries',
      );

      // Perform the search using ElasticSearch
      const searches = msearchOrganizations(query, 0, limit, {
        orgType: 'MINISTRY',
      });

      const response = await osMsearch(searches);

      const parsed = MSearchResponseSchema.parse(response);
      const [organizationsResponse] = parsed.responses;

      // Extract organization IDs from hits
      const organizationIds = organizationsResponse.hits.hits
        .filter((hit) => hit._index === 'lc_organizations')
        .map((hit) => hit._id);

      // Fetch basic organization data from database
      const organizations =
        organizationIds.length > 0
          ? await db.query.Organization.findMany({
              columns: {
                id: true,
                slug: true,
                name: true,
              },
              // Exclude pending/unapproved organizations from public search
              // results even if they were indexed.
              where: (t, { and, inArray, eq, isNotNull }) =>
                and(
                  inArray(t.id, organizationIds),
                  eq(t.type, 'MINISTRY'),
                  isNotNull(t.approvedAt),
                ),
            })
          : [];

      // Create a map for quick lookup and preserve order
      const organizationsMap = new Map(organizations.map((o) => [o.id, o]));

      const items = organizationIds
        .map((id) => organizationsMap.get(id))
        .filter((org): org is NonNullable<typeof org> => Boolean(org))
        .map((org) => ({
          ...org,
          id: OutgoingIdSchema.parse(org.id),
        }));

      moduleLogger.info(
        {
          context: {
            query,
            resultCount: items.length,
          },
        },
        'Ministry search completed',
      );

      return items;
    }),

  getOrganizationById: publicProcedure
    .input(organizationByIdSchema)
    .query(async ({ input }) => {
      moduleLogger.info('Fetching organization by ID');

      const organization = await db.query.Organization.findFirst({
        columns: {
          id: true,
          name: true,
        },
        // Only approved organizations are public; pending/unapproved ones must
        // not be reachable through public endpoints.
        where: (t, { and, eq, isNotNull }) =>
          and(eq(t.id, input.id), isNotNull(t.approvedAt)),
      });

      if (!organization) {
        moduleLogger.warn('Organization not found by ID');
        return null;
      }

      return {
        ...organization,
        id: OutgoingIdSchema.parse(organization.id),
      };
    }),

  getOrganizationTags: publicProcedure.query(async () => {
    moduleLogger.info('Fetching organization tags');

    const tags = await db.query.OrganizationTag.findMany({
      columns: {
        category: true,
        slug: true,
        label: true,
        color: true,
      },
      orderBy: (t, { asc }) => [asc(t.category), asc(t.label)],
      limit: 1024,
    });

    moduleLogger.info(
      {
        context: {
          tagCount: tags.length,
        },
      },
      'Organization tags fetched',
    );

    return tags;
  }),

  getOrganizationBySlug: publicProcedure
    .input(organizationBySlugSchema)
    .query(async ({ input }) => {
      moduleLogger.info('Fetching organization by slug');

      const organization = await db.query.Organization.findFirst({
        columns: {
          id: true,
          name: true,
          type: true,
          description: true,
          avatarPath: true,
          coverPath: true,
          primaryPhoneNumber: true,
          primaryEmail: true,
          websiteUrl: true,
          facebookUrl: true,
          instagramUrl: true,
          xUrl: true,
          youtubeUrl: true,
          tiktokUrl: true,
          linkedinUrl: true,
          threadsUrl: true,
          applePodcastsUrl: true,
          spotifyUrl: true,
          rssUrl: true,
        },
        with: {
          tags: {
            columns: {},
            with: {
              tag: {
                columns: {
                  category: true,
                  color: true,
                  label: true,
                  description: true,
                  slug: true,
                },
              },
            },
          },
          addresses: {
            columns: {
              type: true,
              name: true,
              streetAddress: true,
              locality: true,
              region: true,
              postalCode: true,
              postOfficeBoxNumber: true,
              country: true,
            },
          },
          channelAssociations: {
            columns: {
              officialChannel: true,
            },
            with: {
              channel: {
                columns: {
                  slug: true,
                  name: true,
                  avatarPath: true,
                  visibility: true,
                  approvedAt: true,
                  deletedAt: true,
                },
              },
            },
          },
        },
        // Only approved organizations are public; a pending org must not be
        // viewable by guessing/knowing its slug.
        where: (t, { and, eq, isNotNull }) =>
          and(eq(t.slug, input.slug), isNotNull(t.approvedAt)),
      });

      if (!organization) {
        moduleLogger.warn('Organization not found by slug');
        return null;
      }

      // Process image URLs
      const avatarUrl = organization.avatarPath
        ? getPublicImageUrl(
            publicS3.getS3ProtocolUri(organization.avatarPath),
            {
              resize: organizationAvatarLarge,
            },
          )
        : null;

      const coverUrl = organization.coverPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(organization.coverPath))
        : null;

      // Only surface associated channels that are themselves publicly viewable;
      // a church admin can associate any channel id, so filter out private/
      // unapproved/deleted channels rather than leaking their metadata.
      const visibleAssociations = organization.channelAssociations.filter(
        (assoc) => isChannelRoutable(assoc.channel),
      );

      const officialChannels = visibleAssociations
        .filter((assoc) => assoc.officialChannel)
        .map((assoc) => {
          const channelAvatarUrl = assoc.channel.avatarPath
            ? getPublicImageUrl(
                publicS3.getS3ProtocolUri(assoc.channel.avatarPath),
                {
                  resize: organizationAvatarSmall,
                },
              )
            : null;

          return {
            slug: assoc.channel.slug,
            name: assoc.channel.name,
            avatarUrl: channelAvatarUrl,
          };
        });

      const endorsedChannels = visibleAssociations
        .filter((assoc) => !assoc.officialChannel)
        .map((assoc) => {
          const channelAvatarUrl = assoc.channel.avatarPath
            ? getPublicImageUrl(
                publicS3.getS3ProtocolUri(assoc.channel.avatarPath),
                {
                  resize: organizationAvatarSmall,
                },
              )
            : null;

          return {
            slug: assoc.channel.slug,
            name: assoc.channel.name,
            avatarUrl: channelAvatarUrl,
          };
        });

      // Format phone number
      const formattedPhone = organization.primaryPhoneNumber
        ? formatPhoneNumber(organization.primaryPhoneNumber, 'US')
        : null;

      moduleLogger.info('Organization fetched successfully by slug');

      return {
        id: OutgoingIdSchema.parse(organization.id),
        name: organization.name,
        type: organization.type,
        description: organization.description,
        avatarUrl,
        coverUrl,
        primaryPhoneNumber: formattedPhone?.formatted ?? null,
        primaryEmail: organization.primaryEmail,
        websiteUrl: organization.websiteUrl,
        facebookUrl: organization.facebookUrl,
        instagramUrl: organization.instagramUrl,
        xUrl: organization.xUrl,
        youtubeUrl: organization.youtubeUrl,
        tiktokUrl: organization.tiktokUrl,
        linkedinUrl: organization.linkedinUrl,
        threadsUrl: organization.threadsUrl,
        applePodcastsUrl: organization.applePodcastsUrl,
        spotifyUrl: organization.spotifyUrl,
        rssUrl: organization.rssUrl,
        primaryPhoneUri: formattedPhone?.uri ?? null,
        tags: organization.tags.map((t) => t.tag),
        addresses: organization.addresses,
        officialChannels,
        endorsedChannels,
      };
    }),

  getOrganizationMedia: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ input }) => {
      const { slug, limit } = input;

      moduleLogger.info(
        { context: { slug, limit } },
        'Fetching organization media',
      );

      // Get the organization and its official channels (approved orgs only).
      const organization = await db.query.Organization.findFirst({
        where: (t, { and, eq, isNotNull }) =>
          and(eq(t.slug, slug), isNotNull(t.approvedAt)),
        columns: {
          id: true,
        },
        with: {
          channelAssociations: {
            columns: {
              officialChannel: true,
            },
            with: {
              channel: {
                columns: {
                  id: true,
                  slug: true,
                  name: true,
                  avatarPath: true,
                },
              },
            },
          },
        },
      });

      const officialChannelAssociations =
        organization?.channelAssociations.filter((a) => a.officialChannel) ??
        [];

      if (!organization || officialChannelAssociations.length === 0) {
        return [];
      }

      // Get channel IDs
      const channelIds = officialChannelAssociations.map(
        (assoc) => assoc.channel.id,
      );

      // Fetch recent uploads from all official channels, filtering channel
      // conditions at the DB level via innerJoin so the LIMIT is accurate.
      const uploads = await db
        .select({
          id: UploadRecord.id,
          title: UploadRecord.title,
          lengthSeconds: UploadRecord.lengthSeconds,
          publishedAt: UploadRecord.publishedAt,
          defaultThumbnailPath: UploadRecord.defaultThumbnailPath,
          overrideThumbnailPath: UploadRecord.overrideThumbnailPath,
          channel: {
            id: Channel.id,
            name: Channel.name,
            slug: Channel.slug,
            avatarPath: Channel.avatarPath,
            defaultThumbnailPath: Channel.defaultThumbnailPath,
          },
        })
        .from(UploadRecord)
        .innerJoin(
          Channel,
          and(
            eq(UploadRecord.channelId, Channel.id),
            eq(Channel.visibility, 'PUBLIC'),
            isNotNull(Channel.approvedAt),
            isNull(Channel.deletedAt),
          ),
        )
        .where(
          and(
            inArray(UploadRecord.channelId, channelIds),
            isNotNull(UploadRecord.transcodingFinishedAt),
            eq(UploadRecord.visibility, 'PUBLIC'),
            isNull(UploadRecord.deletedAt),
          ),
        )
        .orderBy(desc(UploadRecord.publishedAt))
        .limit(limit);

      // Transform uploads to include thumbnail URLs
      return uploads.map((upload) => {
        const thumbnailUrl = resolveThumbnailUrl({
          overrideThumbnailPath: upload.overrideThumbnailPath,
          defaultThumbnailPath: upload.defaultThumbnailPath,
          channelDefaultThumbnailPath: upload.channel.defaultThumbnailPath,
          size: 'card',
        });

        const channelAvatarUrl = upload.channel.avatarPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(upload.channel.avatarPath),
              {
                resize: organizationAvatarTiny,
              },
            )
          : null;

        return {
          id: OutgoingIdSchema.parse(upload.id),
          title: upload.title,
          thumbnailUrl,
          lengthSeconds: upload.lengthSeconds,
          publishedAt: upload.publishedAt,
          channel: {
            id: OutgoingIdSchema.parse(upload.channel.id),
            name: upload.channel.name,
            slug: upload.channel.slug,
            avatarUrl: channelAvatarUrl,
          },
        };
      });
    }),
};
