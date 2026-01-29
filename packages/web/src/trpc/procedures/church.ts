import { prisma } from '@letschurch/db';
import {
  client,
  MSearchResponseSchema,
  msearchOrganizations,
} from '@letschurch/elasticsearch';
import { publicS3 } from '@letschurch/s3/public';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import {
  organizationAvatarLarge,
  organizationAvatarMedium,
  organizationAvatarSmall,
  organizationAvatarTiny,
} from '@/util/image-sizes';
import logger from '@/util/logger';
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
        const org = await prisma.organization.findUnique({
          where: { slug: organizationSlug },
          select: { id: true },
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

      const response = await client.msearch({
        searches,
      });

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
      const organizations = await prisma.organization.findMany({
        select: {
          id: true,
          slug: true,
          type: true,
          name: true,
          description: true,
          avatarPath: true,
          primaryEmail: true,
          primaryPhoneNumber: true,
          websiteUrl: true,
          addresses: {
            where: {
              type: 'MEETING',
            },
            select: {
              country: true,
              locality: true,
              region: true,
              streetAddress: true,
              postOfficeBoxNumber: true,
              postalCode: true,
              latitude: true,
              longitude: true,
            },
          },
          tags: {
            select: {
              tag: {
                select: {
                  category: true,
                  color: true,
                  label: true,
                  slug: true,
                },
              },
            },
          },
        },
        where: {
          id: { in: organizationIds },
          type: 'CHURCH',
        },
      });

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

      const response = await client.msearch({
        searches,
      });

      const parsed = MSearchResponseSchema.parse(response);
      const [organizationsResponse] = parsed.responses;

      // Extract organization IDs from hits
      const organizationIds = organizationsResponse.hits.hits
        .filter((hit) => hit._index === 'lc_organizations')
        .map((hit) => hit._id);

      // Fetch basic organization data from database
      const organizations = await prisma.organization.findMany({
        select: {
          id: true,
          slug: true,
          name: true,
        },
        where: {
          id: { in: organizationIds },
          type: 'MINISTRY',
        },
      });

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

      const organization = await prisma.organization.findUnique({
        select: {
          id: true,
          name: true,
        },
        where: {
          id: input.id,
        },
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

    const tags = await prisma.organizationTag.findMany({
      select: {
        category: true,
        slug: true,
        label: true,
        color: true,
      },
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
      take: 1024,
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

      const organization = await prisma.organization.findUnique({
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          avatarPath: true,
          coverPath: true,
          tags: {
            select: {
              tag: {
                select: {
                  category: true,
                  color: true,
                  label: true,
                  description: true,
                  slug: true,
                },
              },
            },
          },
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
          addresses: {
            select: {
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
            where: {
              officialChannel: true,
            },
            select: {
              channel: {
                select: {
                  slug: true,
                  name: true,
                  avatarPath: true,
                },
              },
            },
          },
        },
        where: {
          slug: input.slug,
        },
      });

      if (!organization) {
        moduleLogger.warn('Organization not found by slug');
        return null;
      }

      // Get endorsed channels separately
      const endorsedChannelAssociations =
        await prisma.organizationChannelAssociation.findMany({
          where: {
            organization: {
              slug: input.slug,
            },
            officialChannel: false,
          },
          select: {
            channel: {
              select: {
                slug: true,
                name: true,
                avatarPath: true,
              },
            },
          },
        });

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

      const officialChannels = organization.channelAssociations.map((assoc) => {
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

      const endorsedChannels = endorsedChannelAssociations.map((assoc) => {
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

      // Get the organization and its official channels
      const organization = await prisma.organization.findUnique({
        where: { slug },
        select: {
          id: true,
          channelAssociations: {
            where: {
              officialChannel: true,
            },
            select: {
              channel: {
                select: {
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

      if (!organization || organization.channelAssociations.length === 0) {
        return [];
      }

      // Get channel IDs
      const channelIds = organization.channelAssociations.map(
        (assoc) => assoc.channel.id,
      );

      // Fetch recent uploads from all official channels
      const uploads = await prisma.uploadRecord.findMany({
        select: {
          id: true,
          title: true,
          lengthSeconds: true,
          publishedAt: true,
          defaultThumbnailPath: true,
          overrideThumbnailPath: true,
          channel: {
            select: {
              id: true,
              name: true,
              slug: true,
              avatarPath: true,
              defaultThumbnailPath: true,
            },
          },
        },
        where: {
          channelId: { in: channelIds },
          transcodingFinishedAt: { not: null },
          visibility: 'PUBLIC',
          channel: {
            visibility: 'PUBLIC',
            approvedAt: { not: null },
            deletedAt: null,
          },
        },
        orderBy: {
          publishedAt: 'desc',
        },
        take: limit,
      });

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
