import { Prisma, prisma } from '@letschurch/db';
import { ingestConfig } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { BACKGROUND_QUEUE } from '@letschurch/temporal/queues';
import {
  deleteChannelWorkflow,
  geocodeOrganizationWorkflow,
  postUserRegistrationWorkflow,
  processMediaWorkflow,
} from '@letschurch/temporal/workflows/background';
import { TRPCError } from '@trpc/server';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { IncomingIdSchema } from '@/schemas/common';
import {
  addFeaturedUploadSchema,
  removeFeaturedUploadSchema,
  reorderFeaturedUploadsSchema,
} from '@/schemas/dashboard/admin';
import {
  cancelBackfillFilenames,
  cancelBackfillUploadStateSizes,
  cancelBackfillUploadStates,
  cancelBulkBackupToGlacier,
  cancelCleanupStaleUploadStates,
  client,
  getBackfillFilenamesProgress,
  getBackfillUploadStateSizesProgress,
  getBackfillUploadStatesProgress,
  getBulkBackupToGlacierProgress,
  getCleanupStaleUploadStatesProgress,
  resetPassword,
  startBackfillFilenames,
  startBackfillUploadStateSizes,
  startBackfillUploadStates,
  startBulkBackupToGlacier,
  startCleanupStaleUploadStates,
} from '@/temporal';
import { mantineAvatarSm2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { generateResetPasswordEmail } from '@/util/reset-password-email';
import { getPublicImageUrl } from '@/util/server-env';
import {
  filterUploadsWithActiveWorkflows,
  filterUploadsWithoutActiveWorkflows,
} from '@/util/temporal-workflow';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { authProcedure, router } from '../../trpc';
import { newsletterListsRouter } from '../newsletter-lists';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/admin',
});

const adminProcedure = authProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.appUser.role !== 'ADMIN') {
    moduleLogger.warn(
      {
        appUserId: ctx.session.appUserId,
        context: { role: ctx.session.appUser.role },
      },
      'Non-admin user attempted admin action',
    );

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const adminRouter = router({
  getPendingApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending approvals');

    const [pendingChannels, pendingOrganizations, userCount] =
      await Promise.all([
        prisma.channel.findMany({
          where: {
            approvedAt: null,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
            memberships: {
              select: {
                appUser: {
                  select: {
                    id: true,
                    fullName: true,
                    emails: {
                      select: {
                        email: true,
                        verifiedAt: true,
                      },
                      where: {
                        verifiedAt: { not: null },
                      },
                      take: 1,
                    },
                  },
                },
              },
              where: {
                isAdmin: true,
              },
              take: 1,
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        }),
        prisma.organization.findMany({
          where: {
            approvedAt: null,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            type: true,
            createdAt: true,
            memberships: {
              select: {
                appUser: {
                  select: {
                    id: true,
                    fullName: true,
                    emails: {
                      select: {
                        email: true,
                        verifiedAt: true,
                      },
                      where: {
                        verifiedAt: { not: null },
                      },
                      take: 1,
                    },
                  },
                },
              },
              where: {
                isAdmin: true,
              },
              take: 1,
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        }),
        prisma.appUser.count(),
      ]);

    return {
      channels: pendingChannels,
      organizations: pendingOrganizations,
      userCount,
    };
  }),

  getPendingChannelApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending channel approvals');

    const channels = await prisma.channel.findMany({
      where: {
        approvedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        avatarPath: true,
        visibility: true,
        memberships: {
          select: {
            appUser: {
              select: {
                id: true,
                fullName: true,
                emails: {
                  select: {
                    email: true,
                    verifiedAt: true,
                  },
                  where: {
                    verifiedAt: { not: null },
                  },
                  take: 1,
                },
              },
            },
          },
          where: {
            isAdmin: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return channels.map((channel) => {
      const { avatarPath, ...channelWithoutPath } = channel;
      const avatarUrl = avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
            resize: mantineAvatarSm2x,
          })
        : null;

      return {
        ...channelWithoutPath,
        avatarUrl,
      };
    });
  }),

  getAllChannels: adminProcedure
    .input(
      z
        .object({
          filter: z.enum(['all', 'pending', 'approved']).optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      moduleLogger.info(
        {
          context: {
            filter: input?.filter,
            search: input?.search,
          },
        },
        'Fetching all channels',
      );

      const where: {
        approvedAt?: { not: null } | null;
        OR?: Array<
          | { name: { contains: string; mode: 'insensitive' } }
          | { slug: { contains: string; mode: 'insensitive' } }
        >;
      } = {};

      if (input?.filter === 'pending') {
        where.approvedAt = null;
      } else if (input?.filter === 'approved') {
        where.approvedAt = { not: null };
      }

      if (input?.search) {
        where.OR = [
          { name: { contains: input.search, mode: 'insensitive' } },
          { slug: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      const [channels, totalCount, pendingCount, approvedCount] =
        await Promise.all([
          prisma.channel.findMany({
            where,
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              createdAt: true,
              approvedAt: true,
              deletedAt: true,
              avatarPath: true,
              visibility: true,
              memberships: {
                select: {
                  appUser: {
                    select: {
                      id: true,
                      fullName: true,
                      emails: {
                        select: {
                          email: true,
                          verifiedAt: true,
                        },
                        where: {
                          verifiedAt: { not: null },
                        },
                        take: 1,
                      },
                    },
                  },
                },
                where: {
                  isAdmin: true,
                },
                take: 1,
              },
              _count: {
                select: {
                  uploadRecords: true,
                  subscribers: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          }),
          prisma.channel.count({ where }),
          prisma.channel.count({ where: { approvedAt: null } }),
          prisma.channel.count({ where: { approvedAt: { not: null } } }),
        ]);

      const channelsWithAvatarUrl = channels.map((channel) => {
        const { avatarPath, ...channelWithoutPath } = channel;
        const avatarUrl = avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
              resize: mantineAvatarSm2x,
            })
          : null;

        return {
          ...channelWithoutPath,
          avatarUrl,
        };
      });

      return {
        channels: channelsWithAvatarUrl,
        totalCount,
        pendingCount,
        approvedCount,
      };
    }),

  getPendingOrganizationApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending organization approvals');

    const organizations = await prisma.organization.findMany({
      where: {
        approvedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        type: true,
        createdAt: true,
        avatarPath: true,
        memberships: {
          select: {
            appUser: {
              select: {
                id: true,
                fullName: true,
                emails: {
                  select: {
                    email: true,
                    verifiedAt: true,
                  },
                  where: {
                    verifiedAt: { not: null },
                  },
                  take: 1,
                },
              },
            },
          },
          where: {
            isAdmin: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return organizations.map((org) => {
      const { avatarPath, ...orgWithoutPath } = org;
      const avatarUrl = avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
            resize: mantineAvatarSm2x,
          })
        : null;

      return {
        ...orgWithoutPath,
        avatarUrl,
      };
    });
  }),

  approveChannel: adminProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        },
        'Approving channel',
      );

      try {
        await prisma.channel.update({
          where: {
            id: input.channelId,
          },
          data: {
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
          },
        });

        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
          },
          'Channel approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve channel',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve channel',
        });
      }
    }),

  approveOrganization: adminProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
        },
        'Approving organization',
      );

      try {
        await prisma.organization.update({
          where: {
            id: input.organizationId,
          },
          data: {
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
          },
        });

        moduleLogger.info(
          {
            organizationId: input.organizationId,
            appUserId: ctx.session.appUserId,
          },
          'Organization approved successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            organizationId: input.organizationId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to approve organization',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve organization',
        });
      }
    }),

  getAllOrganizations: adminProcedure
    .input(
      z
        .object({
          filter: z
            .enum(['all', 'pending', 'approved', 'churches', 'ministries'])
            .optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      moduleLogger.info(
        {
          context: {
            filter: input?.filter,
            search: input?.search,
          },
        },
        'Fetching all organizations',
      );

      const where: {
        approvedAt?: { not: null } | null;
        type?: 'CHURCH' | 'MINISTRY';
        OR?: Array<
          | { name: { contains: string; mode: 'insensitive' } }
          | { slug: { contains: string; mode: 'insensitive' } }
        >;
      } = {};

      if (input?.filter === 'pending') {
        where.approvedAt = null;
      } else if (input?.filter === 'approved') {
        where.approvedAt = { not: null };
      } else if (input?.filter === 'churches') {
        where.type = 'CHURCH';
      } else if (input?.filter === 'ministries') {
        where.type = 'MINISTRY';
      }

      if (input?.search) {
        where.OR = [
          { name: { contains: input.search, mode: 'insensitive' } },
          { slug: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      const [
        organizations,
        totalCount,
        pendingCount,
        approvedCount,
        churchCount,
        ministryCount,
      ] = await Promise.all([
        prisma.organization.findMany({
          where,
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            type: true,
            createdAt: true,
            approvedAt: true,
            avatarPath: true,
            primaryEmail: true,
            primaryPhoneNumber: true,
            websiteUrl: true,
            memberships: {
              select: {
                appUser: {
                  select: {
                    id: true,
                    fullName: true,
                    emails: {
                      select: {
                        email: true,
                        verifiedAt: true,
                      },
                      where: {
                        verifiedAt: { not: null },
                      },
                      take: 1,
                    },
                  },
                },
              },
              where: {
                isAdmin: true,
              },
              take: 1,
            },
            addresses: {
              select: {
                id: true,
                type: true,
                name: true,
                query: true,
                latitude: true,
                longitude: true,
                streetAddress: true,
                locality: true,
                region: true,
                postalCode: true,
                country: true,
              },
            },
            _count: {
              select: {
                channelAssociations: true,
                memberships: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
        prisma.organization.count({ where }),
        prisma.organization.count({ where: { approvedAt: null } }),
        prisma.organization.count({ where: { approvedAt: { not: null } } }),
        prisma.organization.count({ where: { type: 'CHURCH' } }),
        prisma.organization.count({ where: { type: 'MINISTRY' } }),
      ]);

      const organizationsWithAvatarUrl = organizations.map((org) => {
        const { avatarPath, ...orgWithoutPath } = org;
        const avatarUrl = avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
              resize: mantineAvatarSm2x,
            })
          : null;

        return {
          ...orgWithoutPath,
          avatarUrl,
        };
      });

      return {
        organizations: organizationsWithAvatarUrl,
        totalCount,
        pendingCount,
        approvedCount,
        churchCount,
        ministryCount,
      };
    }),

  retryGeocoding: adminProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
        },
        'Retrying geocoding for organization',
      );

      try {
        const organization = await prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: {
            id: true,
            addresses: {
              select: {
                id: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        });

        if (!organization) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Organization not found',
          });
        }

        if (organization.addresses.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Organization has no addresses to geocode',
          });
        }

        // Reset geocoding data for addresses that need retry
        await prisma.organizationAddress.updateMany({
          where: {
            organizationId: input.organizationId,
          },
          data: {
            latitude: null,
            longitude: null,
            geocodingJson: Prisma.JsonNull,
          },
        });

        const temporalClient = await client;
        const workflowHandle = await temporalClient.workflow.start(
          geocodeOrganizationWorkflow,
          {
            taskQueue: BACKGROUND_QUEUE,
            workflowId: `geocodeOrganization:${input.organizationId}:${Date.now()}`,
            args: [input.organizationId],
            retry: { maximumAttempts: 5 },
          },
        );

        moduleLogger.info(
          {
            organizationId: input.organizationId,
            appUserId: ctx.session.appUserId,
            workflowId: workflowHandle.workflowId,
          },
          'Geocoding workflow started',
        );

        return {
          success: true,
          workflowId: workflowHandle.workflowId,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            organizationId: input.organizationId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start geocoding workflow',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start geocoding',
        });
      }
    }),

  deleteChannel: adminProcedure
    .input(
      z.object({
        channelId: z.string(),
        channelName: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          context: { channelName: input.channelName },
        },
        'Starting async channel deletion',
      );

      try {
        const temporalClient = await client;
        const workflowHandle = await temporalClient.workflow.start(
          deleteChannelWorkflow,
          {
            taskQueue: BACKGROUND_QUEUE,
            workflowId: `deleteChannel:${input.channelId}:${Date.now()}`,
            args: [input.channelId, input.channelName],
            retry: { maximumAttempts: 5 },
          },
        );

        moduleLogger.info(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            workflowId: workflowHandle.workflowId,
          },
          'Channel deletion workflow started',
        );

        return {
          success: true,
          workflowId: workflowHandle.workflowId,
        };
      } catch (error) {
        moduleLogger.error(
          {
            channelId: input.channelId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start channel deletion workflow',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start channel deletion',
        });
      }
    }),

  deleteOrganization: adminProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
        },
        'Deleting organization',
      );

      try {
        await prisma.organization.delete({
          where: {
            id: input.organizationId,
          },
        });

        moduleLogger.info(
          {
            organizationId: input.organizationId,
            appUserId: ctx.session.appUserId,
          },
          'Organization deleted successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            organizationId: input.organizationId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to delete organization',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete organization',
        });
      }
    }),

  getOrganizationTags: adminProcedure.query(async () => {
    moduleLogger.info('Fetching organization tags');

    return prisma.organizationTag.findMany({
      select: {
        slug: true,
        label: true,
        description: true,
        category: true,
        color: true,
      },
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
    });
  }),

  upsertOrganizationTag: adminProcedure
    .input(
      z.object({
        slug: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional(),
        category: z.enum([
          'DENOMINATION',
          'DOCTRINE',
          'ESCHATOLOGY',
          'CONFESSION',
          'WORSHIP',
          'GOVERNMENT',
          'OTHER',
        ]),
        color: z.enum([
          'GRAY',
          'RED',
          'YELLOW',
          'GREEN',
          'BLUE',
          'INDIGO',
          'PURPLE',
          'PINK',
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            slug: input.slug,
          },
        },
        'Upserting organization tag',
      );

      try {
        const tag = await prisma.organizationTag.upsert({
          where: { slug: input.slug },
          create: input,
          update: {
            label: input.label,
            description: input.description,
            category: input.category,
            color: input.color,
          },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              tagSlug: tag.slug,
            },
          },
          'Organization tag upserted successfully',
        );

        return tag;
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              slug: input.slug,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to upsert organization tag',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to upsert organization tag',
        });
      }
    }),

  deleteOrganizationTag: adminProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            tagSlug: input.slug,
          },
        },
        'Deleting organization tag',
      );

      try {
        await prisma.organizationTag.delete({
          where: { slug: input.slug },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              tagSlug: input.slug,
            },
          },
          'Organization tag deleted successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              tagSlug: input.slug,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to delete organization tag',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete organization tag',
        });
      }
    }),

  getUsers: adminProcedure.query(async () => {
    moduleLogger.info('Fetching users');

    return prisma.appUser.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        createdAt: true,
        emails: {
          select: {
            email: true,
            verifiedAt: true,
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }),

  getUserCount: adminProcedure.query(async () => {
    moduleLogger.info('Fetching user count');

    return prisma.appUser.count();
  }),

  createUser: adminProcedure
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(6),
        fullName: z.string().optional(),
        email: z.email(),
        role: z.enum(['USER', 'ADMIN']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            username: input.username,
            email: input.email,
            role: input.role,
          },
        },
        'Creating user',
      );

      try {
        const hashedPassword = await argon2.hash(input.password);

        const user = await prisma.appUser.create({
          data: {
            username: input.username,
            password: hashedPassword,
            fullName: input.fullName,
            role: input.role,
            emails: {
              create: {
                email: input.email,
                verifiedAt: new Date(),
              },
            },
          },
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
            createdAt: true,
            emails: {
              select: {
                email: true,
                verifiedAt: true,
              },
              where: {
                verifiedAt: { not: null },
              },
              take: 1,
            },
          },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              createdAppUserId: user.id,
              createdAppUserUsername: user.username,
            },
          },
          'User created successfully',
        );

        return user;
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              username: input.username,
              email: input.email,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to create user',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create user',
        });
      }
    }),

  updateUser: adminProcedure
    .input(
      z.object({
        appUserId: z.string(),
        username: z.string().min(1).optional(),
        fullName: z.string().optional(),
        role: z.enum(['USER', 'ADMIN']).optional(),
        email: z.email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          targetId: input.appUserId,
          context: {
            updatedAppUserId: input.appUserId,
          },
        },
        'Updating user',
      );

      try {
        const updateData: {
          username?: string;
          fullName?: string | null;
          role?: 'USER' | 'ADMIN';
        } = {};
        if (input.username) updateData.username = input.username;
        if (input.fullName !== undefined) updateData.fullName = input.fullName;
        if (input.role) updateData.role = input.role;

        const user = await prisma.appUser.update({
          where: { id: input.appUserId },
          data: updateData,
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
            createdAt: true,
            emails: {
              select: {
                email: true,
                verifiedAt: true,
              },
              where: {
                verifiedAt: { not: null },
              },
              take: 1,
            },
          },
        });

        if (input.email) {
          await prisma.appUserEmail.updateMany({
            where: {
              appUserId: input.appUserId,
              verifiedAt: { not: null },
            },
            data: {
              email: input.email,
            },
          });
        }

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.appUserId,
            context: {
              updatedAppUserId: input.appUserId,
            },
          },
          'User updated successfully',
        );

        return user;
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to update user',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user',
        });
      }
    }),

  resetUserPassword: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          targetId: input.userId,
        },
        'Resetting user password',
      );

      try {
        const user = await prisma.appUser.findUnique({
          where: { id: input.userId },
          select: {
            id: true,
            username: true,
            emails: {
              select: { email: true, key: true },
              take: 1,
            },
          },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        const emailRecord = user.emails[0];

        if (!emailRecord) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'User has no email address',
          });
        }

        const { text, html } = generateResetPasswordEmail(
          user.id,
          user.username,
          emailRecord.key,
        );

        await resetPassword(user.id, user.id, emailRecord.email, text, html);

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.userId,
          },
          'User password reset initiated',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.userId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to reset user password',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset user password',
        });
      }
    }),

  resendVerificationEmail: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          targetId: input.userId,
        },
        'Resending verification email',
      );

      try {
        const user = await prisma.appUser.findUnique({
          where: { id: input.userId },
          select: {
            id: true,
            username: true,
            emails: {
              select: { email: true, verifiedAt: true },
              take: 1,
            },
          },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        const emailRecord = user.emails[0];

        if (!emailRecord) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'User has no email address',
          });
        }

        if (emailRecord.verifiedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Email is already verified',
          });
        }

        await (await client).workflow.start(postUserRegistrationWorkflow, {
          args: [
            {
              userId: user.id,
              username: user.username,
              email: emailRecord.email,
              subscribeToNewsletter: false,
            },
          ],
          workflowId: `resend-verification:${user.id}:${Date.now()}`,
          taskQueue: BACKGROUND_QUEUE,
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.userId,
          },
          'Verification email sent',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.userId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to resend verification email',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to resend verification email',
        });
      }
    }),

  getProcessingUploadsCount: adminProcedure.query(async () => {
    moduleLogger.info('Fetching processing uploads count');

    try {
      // Get uploads that are not fully processed
      const allProcessingUploads = await prisma.uploadRecord.findMany({
        select: {
          finalizedUploadKey: true,
        },
        where: {
          OR: [
            { transcodingFinishedAt: null },
            { transcribingFinishedAt: null },
          ],
        },
      });

      // Filter to only include uploads with active workflows
      const uploadsWithActiveWorkflows =
        await filterUploadsWithActiveWorkflows(allProcessingUploads);

      return uploadsWithActiveWorkflows.length;
    } catch (error) {
      moduleLogger.error(
        {
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to fetch processing uploads count',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch processing uploads count',
      });
    }
  }),

  getProcessingUploads: adminProcedure.query(async () => {
    moduleLogger.info('Fetching processing uploads');

    try {
      // Get uploads that are not fully processed
      const allProcessingUploads = await prisma.uploadRecord.findMany({
        select: {
          id: true,
          title: true,
          description: true,
          visibility: true,
          createdAt: true,
          lengthSeconds: true,
          transcodingFinishedAt: true,
          transcribingFinishedAt: true,
          transcodingProgress: true,
          finalizedUploadKey: true,
          channel: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        where: {
          OR: [
            { transcodingFinishedAt: null },
            { transcribingFinishedAt: null },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      // Filter to only include uploads with active workflows
      const uploadsWithActiveWorkflows =
        await filterUploadsWithActiveWorkflows(allProcessingUploads);

      return uploadsWithActiveWorkflows.map(
        ({ finalizedUploadKey: _, ...upload }) => upload,
      );
    } catch (error) {
      moduleLogger.error(
        {
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to fetch processing uploads',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch processing uploads',
      });
    }
  }),

  getFeaturedUploads: adminProcedure.query(async () => {
    moduleLogger.info('Fetching featured uploads');

    const featuredUploads = await prisma.featuredUpload.findMany({
      select: {
        uploadRecordId: true,
        rank: true,
        createdAt: true,
        uploadRecord: {
          select: {
            id: true,
            title: true,
            description: true,
            lengthSeconds: true,
            defaultThumbnailPath: true,
            overrideThumbnailPath: true,
            defaultThumbnailBlurhash: true,
            overrideThumbnailBlurhash: true,
            channel: {
              select: {
                id: true,
                name: true,
                slug: true,
                avatarPath: true,
                avatarBlurhash: true,
                defaultThumbnailPath: true,
              },
            },
          },
        },
      },
      orderBy: {
        rank: 'asc',
      },
    });

    return featuredUploads.map(({ uploadRecord, ...rest }) => {
      const thumbnailUrl = resolveThumbnailUrl({
        overrideThumbnailPath: uploadRecord.overrideThumbnailPath,
        defaultThumbnailPath: uploadRecord.defaultThumbnailPath,
        channelDefaultThumbnailPath: uploadRecord.channel.defaultThumbnailPath,
        size: 'table',
      });

      const { avatarPath, ...channelWithoutPath } = uploadRecord.channel;
      const channelAvatarUrl = avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
            resize: mantineAvatarSm2x,
          })
        : null;

      return {
        ...rest,
        uploadRecord: {
          ...uploadRecord,
          thumbnailUrl,
          channel: {
            ...channelWithoutPath,
            avatarUrl: channelAvatarUrl,
          },
        },
      };
    });
  }),

  addFeaturedUpload: adminProcedure
    .input(addFeaturedUploadSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          uploadId: input.uploadId,
          appUserId: ctx.session.appUserId,
        },
        'Adding featured upload',
      );

      try {
        // Check if upload exists and is public
        const upload = await prisma.uploadRecord.findUnique({
          where: { id: input.uploadId },
          select: {
            id: true,
            visibility: true,
            transcodingFinishedAt: true,
            transcribingFinishedAt: true,
          },
        });

        if (!upload) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found',
          });
        }

        if (upload.visibility !== 'PUBLIC') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only public uploads can be featured',
          });
        }

        if (!upload.transcodingFinishedAt || !upload.transcribingFinishedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload must be fully processed before featuring',
          });
        }

        // Check if already featured
        const existing = await prisma.featuredUpload.findUnique({
          where: { uploadRecordId: input.uploadId },
        });

        if (existing) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload is already featured',
          });
        }

        // Get max rank
        const maxRank = await prisma.featuredUpload.findFirst({
          select: { rank: true },
          orderBy: { rank: 'desc' },
        });

        const newRank = (maxRank?.rank ?? -1) + 1;

        const featuredUpload = await prisma.featuredUpload.create({
          data: {
            uploadRecordId: input.uploadId,
            rank: newRank,
          },
        });

        moduleLogger.info(
          {
            uploadId: input.uploadId,
            appUserId: ctx.session.appUserId,
            context: {
              rank: newRank,
            },
          },
          'Featured upload added successfully',
        );

        return featuredUpload;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            uploadId: input.uploadId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to add featured upload',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add featured upload',
        });
      }
    }),

  removeFeaturedUpload: adminProcedure
    .input(removeFeaturedUploadSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          uploadId: input.uploadId,
          appUserId: ctx.session.appUserId,
        },
        'Removing featured upload',
      );

      try {
        // Get the rank of the upload being removed
        const featuredUpload = await prisma.featuredUpload.findUnique({
          where: { uploadRecordId: input.uploadId },
          select: { rank: true },
        });

        if (!featuredUpload) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Featured upload not found',
          });
        }

        // Delete the featured upload
        await prisma.featuredUpload.delete({
          where: { uploadRecordId: input.uploadId },
        });

        // Rebalance ranks: decrement all ranks greater than the removed one
        await prisma.featuredUpload.updateMany({
          where: {
            rank: { gt: featuredUpload.rank },
          },
          data: {
            rank: { decrement: 1 },
          },
        });

        moduleLogger.info(
          {
            uploadId: input.uploadId,
            appUserId: ctx.session.appUserId,
          },
          'Featured upload removed successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            uploadId: input.uploadId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to remove featured upload',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to remove featured upload',
        });
      }
    }),

  reorderFeaturedUploads: adminProcedure
    .input(reorderFeaturedUploadsSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            uploadIds: input.uploadIds,
          },
        },
        'Reordering featured uploads',
      );

      try {
        // Verify all uploads are currently featured
        const existingFeatured = await prisma.featuredUpload.findMany({
          select: { uploadRecordId: true },
        });

        const existingIds = new Set(
          existingFeatured.map((f) => f.uploadRecordId),
        );
        const inputIds = new Set(input.uploadIds);

        if (existingIds.size !== inputIds.size) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload count mismatch',
          });
        }

        for (const id of input.uploadIds) {
          if (!existingIds.has(id)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Upload ${id} is not featured`,
            });
          }
        }

        // Update ranks based on array order
        await Promise.all(
          input.uploadIds.map((uploadId, index) =>
            prisma.featuredUpload.update({
              where: { uploadRecordId: uploadId },
              data: { rank: index },
            }),
          ),
        );

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              uploadIds: input.uploadIds,
            },
          },
          'Featured uploads reordered successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              uploadIds: input.uploadIds,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to reorder featured uploads',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reorder featured uploads',
        });
      }
    }),

  toggleFeaturedUpload: adminProcedure
    .input(z.object({ uploadId: IncomingIdSchema }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          uploadId: input.uploadId,
          appUserId: ctx.session.appUserId,
        },
        'Toggling featured upload',
      );

      try {
        // Check if upload is currently featured
        const existing = await prisma.featuredUpload.findUnique({
          where: { uploadRecordId: input.uploadId },
        });

        if (existing) {
          // Remove from featured
          await prisma.featuredUpload.delete({
            where: { uploadRecordId: input.uploadId },
          });

          // Rebalance ranks
          await prisma.featuredUpload.updateMany({
            where: {
              rank: { gt: existing.rank },
            },
            data: {
              rank: { decrement: 1 },
            },
          });

          moduleLogger.info(
            {
              uploadId: input.uploadId,
              appUserId: ctx.session.appUserId,
            },
            'Upload removed from featured',
          );

          return { isFeatured: false };
        }

        // Add to featured
        const upload = await prisma.uploadRecord.findUnique({
          where: { id: input.uploadId },
          select: {
            id: true,
            visibility: true,
            transcodingFinishedAt: true,
            transcribingFinishedAt: true,
          },
        });

        if (!upload) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found',
          });
        }

        if (upload.visibility !== 'PUBLIC') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only public uploads can be featured',
          });
        }

        if (!upload.transcodingFinishedAt || !upload.transcribingFinishedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload must be fully processed before featuring',
          });
        }

        // Get max rank
        const maxRank = await prisma.featuredUpload.findFirst({
          select: { rank: true },
          orderBy: { rank: 'desc' },
        });

        const newRank = (maxRank?.rank ?? -1) + 1;

        await prisma.featuredUpload.create({
          data: {
            uploadRecordId: input.uploadId,
            rank: newRank,
          },
        });

        moduleLogger.info(
          {
            uploadId: input.uploadId,
            appUserId: ctx.session.appUserId,
            context: {
              rank: newRank,
            },
          },
          'Upload added to featured',
        );

        return { isFeatured: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            uploadId: input.uploadId,
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to toggle featured upload',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to toggle featured upload',
        });
      }
    }),

  // Upload Backup procedures
  getUploadBackupStats: adminProcedure.query(async () => {
    moduleLogger.info('Fetching upload backup stats');

    const [
      statusCounts,
      totalStorageResult,
      nullSizeBytesCount,
      backfillProgress,
      backfillSizesProgress,
      bulkBackupProgress,
      cleanupProgress,
    ] = await Promise.all([
      prisma.uploadState.groupBy({
        by: ['backupStatus'],
        _count: { id: true },
      }),
      prisma.uploadState.aggregate({
        _sum: { sizeBytes: true },
      }),
      prisma.uploadState.count({
        where: { sizeBytes: null },
      }),
      getBackfillUploadStatesProgress(),
      getBackfillUploadStateSizesProgress(),
      getBulkBackupToGlacierProgress(),
      getCleanupStaleUploadStatesProgress(),
    ]);

    const stats = {
      notBackedUp: 0,
      backingUp: 0,
      backedUp: 0,
      backupFailed: 0,
      total: 0,
      totalStorageBytes: totalStorageResult._sum.sizeBytes?.toString() ?? '0',
      nullSizeBytesCount,
    };

    for (const result of statusCounts) {
      stats.total += result._count.id;
      switch (result.backupStatus) {
        case 'NOT_BACKED_UP':
          stats.notBackedUp = result._count.id;
          break;
        case 'BACKING_UP':
          stats.backingUp = result._count.id;
          break;
        case 'BACKED_UP':
          stats.backedUp = result._count.id;
          break;
        case 'BACKUP_FAILED':
          stats.backupFailed = result._count.id;
          break;
      }
    }

    return {
      stats,
      backfillStatus: backfillProgress,
      backfillSizesStatus: backfillSizesProgress,
      bulkBackupStatus: bulkBackupProgress,
      cleanupStatus: cleanupProgress,
    };
  }),

  startBackfillUploadStates: adminProcedure
    .input(
      z.object({
        batchSize: z.number().min(1).max(1000).default(100),
        delayBetweenBatchesMs: z.number().min(0).max(10000).default(100),
        maxRows: z.number().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            batchSize: input.batchSize,
            delayBetweenBatchesMs: input.delayBetweenBatchesMs,
            maxRows: input.maxRows,
          },
        },
        'Starting backfill upload states',
      );

      try {
        // Check if backfill is already running
        const progress = await getBackfillUploadStatesProgress();
        if (progress?.status === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Backfill is already running',
          });
        }

        await startBackfillUploadStates({
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          ingestBucket: ingestConfig.bucket,
          maxRows: input.maxRows,
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              batchSize: input.batchSize,
              delayBetweenBatchesMs: input.delayBetweenBatchesMs,
              maxRows: input.maxRows,
            },
          },
          'Backfill upload states started successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start backfill upload states',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start backfill',
        });
      }
    }),

  cancelBackfillUploadStates: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Cancelling backfill upload states',
    );

    try {
      await cancelBackfillUploadStates();

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Backfill upload states cancelled successfully',
      );

      return { success: true };
    } catch (error) {
      moduleLogger.error(
        {
          appUserId: ctx.session.appUserId,
          context: {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
        'Failed to cancel backfill upload states',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel backfill',
      });
    }
  }),

  // Cleanup Stale Upload States procedures
  startCleanupStaleUploadStates: adminProcedure
    .input(
      z.object({
        batchSize: z.number().min(1).max(1000).default(100),
        delayBetweenBatchesMs: z.number().min(0).max(10000).default(100),
        olderThanDays: z.number().min(1).max(365).default(30),
        maxRows: z.number().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            batchSize: input.batchSize,
            delayBetweenBatchesMs: input.delayBetweenBatchesMs,
            olderThanDays: input.olderThanDays,
            maxRows: input.maxRows,
          },
        },
        'Starting cleanup stale upload states',
      );

      try {
        // Check if cleanup is already running
        const progress = await getCleanupStaleUploadStatesProgress();
        if (progress?.status === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cleanup is already running',
          });
        }

        await startCleanupStaleUploadStates({
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          olderThanDays: input.olderThanDays,
          maxRows: input.maxRows,
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              batchSize: input.batchSize,
              delayBetweenBatchesMs: input.delayBetweenBatchesMs,
              olderThanDays: input.olderThanDays,
              maxRows: input.maxRows,
            },
          },
          'Cleanup stale upload states started successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start cleanup stale upload states',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start cleanup',
        });
      }
    }),

  cancelCleanupStaleUploadStates: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Cancelling cleanup stale upload states',
    );

    try {
      await cancelCleanupStaleUploadStates();

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Cleanup stale upload states cancelled successfully',
      );

      return { success: true };
    } catch (error) {
      moduleLogger.error(
        {
          appUserId: ctx.session.appUserId,
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to cancel cleanup stale upload states',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel cleanup',
      });
    }
  }),

  // Backfill Upload State Sizes procedures
  startBackfillUploadStateSizes: adminProcedure
    .input(
      z.object({
        batchSize: z.number().min(1).max(1000).default(100),
        delayBetweenBatchesMs: z.number().min(0).max(10000).default(500),
        maxRows: z.number().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            batchSize: input.batchSize,
            delayBetweenBatchesMs: input.delayBetweenBatchesMs,
            maxRows: input.maxRows,
          },
        },
        'Starting backfill upload state sizes',
      );

      try {
        // Check if backfill is already running
        const progress = await getBackfillUploadStateSizesProgress();
        if (progress?.status === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Backfill sizes is already running',
          });
        }

        await startBackfillUploadStateSizes({
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          ingestBucket: ingestConfig.bucket,
          ingestEndpoint: ingestConfig.endpoint,
          ingestRegion: ingestConfig.region,
          ingestAccessKeyId: ingestConfig.accessKeyId,
          ingestSecretAccessKey: ingestConfig.secretAccessKey,
          maxRows: input.maxRows,
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              batchSize: input.batchSize,
              delayBetweenBatchesMs: input.delayBetweenBatchesMs,
              maxRows: input.maxRows,
            },
          },
          'Backfill upload state sizes started successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start backfill upload state sizes',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start backfill sizes',
        });
      }
    }),

  cancelBackfillUploadStateSizes: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Cancelling backfill upload state sizes',
    );

    try {
      await cancelBackfillUploadStateSizes();

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Backfill upload state sizes cancelled successfully',
      );

      return { success: true };
    } catch (error) {
      moduleLogger.error(
        {
          appUserId: ctx.session.appUserId,
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to cancel backfill upload state sizes',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel backfill sizes',
      });
    }
  }),

  getBackfillFilenamesStatus: adminProcedure.query(async () => {
    const [remainingCount, progress] = await Promise.all([
      prisma.uploadRecord.count({
        where: {
          uploadFinalized: true,
          finalizedUploadKey: { not: null },
          originalFileName: null,
        },
      }),
      getBackfillFilenamesProgress(),
    ]);

    return {
      remainingCount,
      workflowStatus: progress,
    };
  }),

  startBackfillFilenames: adminProcedure
    .input(
      z.object({
        batchSize: z.number().min(1).max(1000).default(50),
        delayBetweenBatchesMs: z.number().min(0).max(10000).default(500),
        maxRows: z.number().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            batchSize: input.batchSize,
            delayBetweenBatchesMs: input.delayBetweenBatchesMs,
            maxRows: input.maxRows,
          },
        },
        'Starting backfill original filenames',
      );

      try {
        // Check if backfill is already running
        const progress = await getBackfillFilenamesProgress();
        if (progress?.status === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Backfill is already running',
          });
        }

        await startBackfillFilenames({
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          maxRows: input.maxRows,
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              batchSize: input.batchSize,
              delayBetweenBatchesMs: input.delayBetweenBatchesMs,
              maxRows: input.maxRows,
            },
          },
          'Backfill original filenames started successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
          },
          'Failed to start backfill original filenames',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start backfill filenames',
        });
      }
    }),

  cancelBackfillFilenames: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Cancelling backfill original filenames',
    );

    try {
      await cancelBackfillFilenames();

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Backfill original filenames cancelled successfully',
      );

      return { success: true };
    } catch (error) {
      moduleLogger.error(
        {
          appUserId: ctx.session.appUserId,
          context: {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
        'Failed to cancel backfill original filenames',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel backfill filenames',
      });
    }
  }),

  startBulkBackupToGlacier: adminProcedure
    .input(
      z.object({
        batchSize: z.number().min(1).max(100).default(10),
        delayBetweenBatchesMs: z.number().min(0).max(60000).default(1000),
        maxUploads: z.number().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            batchSize: input.batchSize,
            delayBetweenBatchesMs: input.delayBetweenBatchesMs,
            maxUploads: input.maxUploads,
          },
        },
        'Starting bulk backup to Glacier',
      );

      try {
        // Check if bulk backup is already running
        const progress = await getBulkBackupToGlacierProgress();
        if (progress?.status === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Bulk backup is already running',
          });
        }

        await startBulkBackupToGlacier({
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          maxUploads: input.maxUploads,
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              batchSize: input.batchSize,
              delayBetweenBatchesMs: input.delayBetweenBatchesMs,
              maxUploads: input.maxUploads,
            },
          },
          'Bulk backup to Glacier started successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start bulk backup to Glacier',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start bulk backup',
        });
      }
    }),

  cancelBulkBackupToGlacier: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Cancelling bulk backup to Glacier',
    );

    try {
      await cancelBulkBackupToGlacier();

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Bulk backup to Glacier cancelled successfully',
      );

      return { success: true };
    } catch (error) {
      moduleLogger.error(
        {
          appUserId: ctx.session.appUserId,
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to cancel bulk backup to Glacier',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel bulk backup',
      });
    }
  }),

  getFailedBackups: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      moduleLogger.info('Fetching failed backups');

      const [failedBackups, totalCount] = await Promise.all([
        prisma.uploadState.findMany({
          where: { backupStatus: 'BACKUP_FAILED' },
          orderBy: { updatedAt: 'desc' },
          take: input.limit,
          skip: input.offset,
          select: {
            id: true,
            s3Key: true,
            s3Bucket: true,
            uploadType: true,
            sizeBytes: true,
            createdAt: true,
            updatedAt: true,
            uploadRecord: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        }),
        prisma.uploadState.count({
          where: { backupStatus: 'BACKUP_FAILED' },
        }),
      ]);

      return {
        failedBackups,
        totalCount,
      };
    }),

  retryFailedBackup: adminProcedure
    .input(
      z.object({
        uploadStateId: z.uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      moduleLogger.info(
        {
          context: {
            uploadStateId: input.uploadStateId,
          },
        },
        'Retrying failed backup',
      );

      try {
        const uploadState = await prisma.uploadState.findUnique({
          where: { id: input.uploadStateId },
        });

        if (!uploadState) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload state not found',
          });
        }

        if (uploadState.backupStatus !== 'BACKUP_FAILED') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Upload is not in BACKUP_FAILED state, current status: ${uploadState.backupStatus}`,
          });
        }

        await prisma.uploadState.update({
          where: { id: input.uploadStateId },
          data: {
            backupStatus: 'NOT_BACKED_UP',
            backupKey: null,
            backedUpAt: null,
          },
        });

        moduleLogger.info(
          {
            context: {
              uploadStateId: input.uploadStateId,
            },
          },
          'Successfully reset failed backup to NOT_BACKED_UP',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              error: error instanceof Error ? error.message : String(error),
              uploadStateId: input.uploadStateId,
            },
          },
          'Failed to retry backup',
        );

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retry backup',
        });
      }
    }),

  retryAllFailedBackups: adminProcedure.mutation(async () => {
    moduleLogger.info('Retrying all failed backups');

    try {
      const result = await prisma.uploadState.updateMany({
        where: { backupStatus: 'BACKUP_FAILED' },
        data: {
          backupStatus: 'NOT_BACKED_UP',
          backupKey: null,
          backedUpAt: null,
        },
      });

      moduleLogger.info(
        {
          context: {
            count: result.count,
          },
        },
        'Successfully reset all failed backups to NOT_BACKED_UP',
      );

      return { success: true, count: result.count };
    } catch (error) {
      moduleLogger.error(
        {
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to retry all backups',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retry all backups',
      });
    }
  }),

  getFailedUploadsCount: adminProcedure.query(async () => {
    moduleLogger.info('Fetching failed uploads count');

    try {
      // Get uploads that have been finalized but not fully processed
      const failedUploads = await prisma.uploadRecord.findMany({
        where: {
          uploadFinalized: true,
          finalizedUploadKey: { not: null },
          OR: [
            {
              transcodingStartedAt: null,
              transcodingFinishedAt: null,
            },
            {
              transcodingStartedAt: { not: null },
              transcodingFinishedAt: null,
            },
            {
              transcribingStartedAt: { not: null },
              transcribingFinishedAt: null,
            },
          ],
        },
        select: {
          finalizedUploadKey: true,
        },
      });

      // Filter out uploads that are currently processing
      const actuallyFailedUploads =
        await filterUploadsWithoutActiveWorkflows(failedUploads);

      return actuallyFailedUploads.length;
    } catch (error) {
      moduleLogger.error(
        {
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to fetch failed uploads count',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch failed uploads count',
      });
    }
  }),

  getFailedUploads: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      moduleLogger.info('Fetching failed uploads');

      try {
        // Get uploads that have been finalized but not fully processed
        const failedUploads = await prisma.uploadRecord.findMany({
          where: {
            uploadFinalized: true,
            finalizedUploadKey: { not: null },
            OR: [
              {
                transcodingStartedAt: null,
                transcodingFinishedAt: null,
              },
              {
                transcodingStartedAt: { not: null },
                transcodingFinishedAt: null,
              },
              {
                transcribingStartedAt: { not: null },
                transcribingFinishedAt: null,
              },
            ],
          },
          select: {
            id: true,
            title: true,
            description: true,
            createdAt: true,
            uploadFinalizedAt: true,
            finalizedUploadKey: true,
            transcodingStartedAt: true,
            transcodingFinishedAt: true,
            transcribingStartedAt: true,
            transcribingFinishedAt: true,
            channel: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                username: true,
                fullName: true,
              },
            },
          },
          orderBy: { uploadFinalizedAt: 'desc' },
          take: input.limit,
          skip: input.offset,
        });

        const totalCount = await prisma.uploadRecord.count({
          where: {
            uploadFinalized: true,
            finalizedUploadKey: { not: null },
            OR: [
              {
                transcodingStartedAt: null,
                transcodingFinishedAt: null,
              },
              {
                transcodingStartedAt: { not: null },
                transcodingFinishedAt: null,
              },
              {
                transcribingStartedAt: { not: null },
                transcribingFinishedAt: null,
              },
            ],
          },
        });

        // Filter out uploads that are currently processing
        const actuallyFailedUploads =
          await filterUploadsWithoutActiveWorkflows(failedUploads);

        return {
          uploads: actuallyFailedUploads,
          totalCount,
        };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to fetch failed uploads',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch failed uploads',
        });
      }
    }),

  retryUploadProcessing: adminProcedure
    .input(
      z.object({
        uploadRecordId: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          targetId: input.uploadRecordId,
        },
        'Retrying upload processing',
      );

      try {
        const upload = await prisma.uploadRecord.findUnique({
          where: { id: input.uploadRecordId },
          select: {
            id: true,
            uploadFinalized: true,
            finalizedUploadKey: true,
            transcodingFinishedAt: true,
            transcribingFinishedAt: true,
          },
        });

        if (!upload) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found',
          });
        }

        if (!upload.uploadFinalized || !upload.finalizedUploadKey) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload is not finalized',
          });
        }

        // Check if already processed
        if (upload.transcodingFinishedAt && upload.transcribingFinishedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload is already fully processed',
          });
        }

        // Check if workflow is already running
        const temporalClient = await client;
        const workflowId = `processMedia:${upload.finalizedUploadKey}`;

        try {
          const handle = temporalClient.workflow.getHandle(workflowId);
          const description = await handle.describe();

          if (description.status.name === 'RUNNING') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Processing workflow is already running',
            });
          }
        } catch (error) {
          // Workflow doesn't exist, which is fine - we'll start it
          if (error instanceof TRPCError) {
            throw error;
          }
        }

        // Determine what needs to be processed
        let scope: 'transcode' | 'transcribe' | 'everything' = 'everything';
        if (upload.transcodingFinishedAt && !upload.transcribingFinishedAt) {
          scope = 'transcribe';
        } else if (
          !upload.transcodingFinishedAt &&
          upload.transcribingFinishedAt
        ) {
          scope = 'transcode';
        }

        await prisma.uploadRecord.update({
          where: { id: input.uploadRecordId },
          data: {
            transcodingStartedAt: null,
            transcodingFinishedAt: null,
            transcribingStartedAt: null,
            transcribingFinishedAt: null,
          },
        });

        // Start the workflow
        await temporalClient.workflow.start(processMediaWorkflow, {
          taskQueue: BACKGROUND_QUEUE,
          workflowId,
          args: [input.uploadRecordId, scope],
          retry: { maximumAttempts: 5 },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.uploadRecordId,
          },
          'Upload processing workflow started',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.uploadRecordId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to retry upload processing',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retry upload processing',
        });
      }
    }),

  bulkRetryProcessingUploads: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info(
      {
        appUserId: ctx.session.appUserId,
      },
      'Bulk retrying processing uploads',
    );

    try {
      // Get all processing uploads
      const processingUploads = await prisma.uploadRecord.findMany({
        where: {
          uploadFinalized: true,
          finalizedUploadKey: { not: null },
          OR: [
            { transcodingFinishedAt: null },
            { transcribingFinishedAt: null },
          ],
        },
        select: {
          id: true,
          finalizedUploadKey: true,
          transcodingFinishedAt: true,
          transcribingFinishedAt: true,
        },
      });

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            count: processingUploads.length,
          },
        },
        'Found processing uploads',
      );

      if (processingUploads.length === 0) {
        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
          },
          'No processing uploads to retry',
        );
        return { success: true, retriedCount: 0, skippedCount: 0 };
      }

      // Filter out uploads with active workflows
      const uploadsToRetry =
        await filterUploadsWithoutActiveWorkflows(processingUploads);

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            totalProcessing: processingUploads.length,
            toRetry: uploadsToRetry.length,
            skipped: processingUploads.length - uploadsToRetry.length,
          },
        },
        'Filtered uploads for bulk retry',
      );

      const temporalClient = await client;
      let retriedCount = 0;

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            uploadsToRetry: uploadsToRetry.length,
          },
        },
        'Starting bulk retry loop',
      );

      // Retry each upload
      for (const upload of uploadsToRetry) {
        moduleLogger.info(
          {
            uploadId: upload.id,
            appUserId: ctx.session.appUserId,
            context: {
              totalToRetry: uploadsToRetry.length,
            },
          },
          'Bulk retry: Processing upload',
        );

        try {
          // Determine what needs to be processed
          let scope: 'transcode' | 'transcribe' | 'everything' = 'everything';
          if (upload.transcodingFinishedAt && !upload.transcribingFinishedAt) {
            scope = 'transcribe';
          } else if (
            !upload.transcodingFinishedAt &&
            upload.transcribingFinishedAt
          ) {
            scope = 'transcode';
          }

          moduleLogger.info(
            {
              uploadId: upload.id,
              context: {
                transcodingFinished: !!upload.transcodingFinishedAt,
                transcribingFinished: !!upload.transcribingFinishedAt,
              },
            },
            'Bulk retry: Determined scope',
          );

          await prisma.uploadRecord.update({
            where: { id: upload.id },
            data: {
              transcodingStartedAt: null,
              transcodingFinishedAt: null,
              transcribingStartedAt: null,
              transcribingFinishedAt: null,
            },
          });

          moduleLogger.info(
            {
              uploadId: upload.id,
            },
            'Bulk retry: Reset upload record timestamps',
          );

          const workflowId = `processMedia:${upload.finalizedUploadKey}`;
          await temporalClient.workflow.start(processMediaWorkflow, {
            taskQueue: BACKGROUND_QUEUE,
            workflowId,
            args: [upload.id, scope],
            retry: { maximumAttempts: 5 },
          });

          retriedCount++;

          moduleLogger.info(
            {
              uploadId: upload.id,
              appUserId: ctx.session.appUserId,
              context: {
                totalToRetry: uploadsToRetry.length,
                retriedSoFar: retriedCount,
              },
            },
            'Bulk retry: Started workflow',
          );
        } catch (error) {
          moduleLogger.error(
            {
              uploadId: upload.id,
              appUserId: ctx.session.appUserId,
              context: {
                totalToRetry: uploadsToRetry.length,
                error: error instanceof Error ? error.message : String(error),
              },
            },
            'Bulk retry: Failed to start workflow',
          );
          // Continue with other uploads even if one fails
        }
      }

      const skippedCount = processingUploads.length - retriedCount;

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Bulk retry processing uploads completed',
      );

      return { success: true, retriedCount, skippedCount };
    } catch (error) {
      moduleLogger.error(
        {
          appUserId: ctx.session.appUserId,
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to bulk retry processing uploads',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to bulk retry processing uploads',
      });
    }
  }),

  getSearchLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      moduleLogger.info(
        {
          context: {
            limit: input.limit,
            offset: input.offset,
          },
        },
        'Fetching search logs',
      );

      const [searchLogs, totalCount] = await Promise.all([
        prisma.searchLogEntry.findMany({
          where: {
            userDeletedAt: null,
          },
          select: {
            id: true,
            query: true,
            params: true,
            createdAt: true,
            mediaCount: true,
            transcriptCount: true,
            channelCount: true,
            appUser: {
              select: {
                id: true,
                username: true,
                fullName: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: input.limit,
          skip: input.offset,
        }),
        prisma.searchLogEntry.count({
          where: {
            userDeletedAt: null,
          },
        }),
      ]);

      return {
        searchLogs,
        totalCount,
      };
    }),

  getDeletingUploadsCount: adminProcedure.query(async () => {
    moduleLogger.info('Fetching deleting uploads count');

    try {
      const deletingCount = await prisma.uploadRecord.count({
        where: {
          deletedAt: { not: null },
        },
      });

      return deletingCount;
    } catch (error) {
      moduleLogger.error(
        {
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to fetch deleting uploads count',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch deleting uploads count',
      });
    }
  }),

  getDeletingUploads: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      moduleLogger.info('Fetching deleting uploads');

      try {
        const [deletingUploads, totalCount] = await Promise.all([
          prisma.uploadRecord.findMany({
            where: {
              deletedAt: { not: null },
            },
            select: {
              id: true,
              title: true,
              description: true,
              createdAt: true,
              deletedAt: true,
              uploadFinalizedAt: true,
              channel: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
              createdBy: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                },
              },
            },
            orderBy: { deletedAt: 'desc' },
            take: input.limit,
            skip: input.offset,
          }),
          prisma.uploadRecord.count({
            where: {
              deletedAt: { not: null },
            },
          }),
        ]);

        return {
          uploads: deletingUploads,
          totalCount,
        };
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to fetch deleting uploads',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch deleting uploads',
        });
      }
    }),

  newsletterLists: newsletterListsRouter,
});
