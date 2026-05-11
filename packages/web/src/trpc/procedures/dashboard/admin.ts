import {
  AppUser,
  AppUserEmail,
  Channel,
  ChannelSubscription,
  db,
  FeaturedUpload,
  Organization,
  OrganizationAddress,
  OrganizationChannelAssociation,
  OrganizationTag,
  SearchLogEntry,
  UploadRecord,
  UploadState,
} from '@letschurch/db';
import { ingestConfig } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import {
  BACKGROUND_QUEUE,
  CURRENT_PIPELINE_VERSION,
  PRIORITY_RETRY,
} from '@letschurch/temporal/queues';
import {
  deleteChannelWorkflow,
  geocodeOrganizationWorkflow,
  postUserRegistrationWorkflow,
  processMediaWorkflow,
} from '@letschurch/temporal/workflows/background';
import { TRPCError } from '@trpc/server';
import * as argon2 from 'argon2';
import {
  and,
  count,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  sum,
} from 'drizzle-orm';
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
  cancelReindex,
  cancelRemuxAll,
  cancelReprocess,
  client,
  deleteUpload,
  getBackfillFilenamesProgress,
  getBackfillUploadStateSizesProgress,
  getBackfillUploadStatesProgress,
  getBulkBackupToGlacierProgress,
  getCleanupStaleUploadStatesProgress,
  getReindexProgress,
  getRemuxWorkflowStatus,
  getReprocessWorkflowStatus,
  makeProcessMediaWorkflowId,
  type ReindexKind,
  type RemuxScope,
  type ReprocessScope,
  resetPassword,
  startBackfillFilenames,
  startBackfillUploadStateSizes,
  startBackfillUploadStates,
  startBulkBackupToGlacier,
  startCleanupStaleUploadStates,
  startReindex,
  startRemuxAll,
  startReprocess,
} from '@/temporal';
import { mantineAvatarSm2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { escapeLikePattern } from '@/util/misc';
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

    const [pendingChannels, pendingOrganizations, userCountRows] =
      await Promise.all([
        db.query.Channel.findMany({
          where: (t, { isNull }) => isNull(t.approvedAt),
          columns: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
          },
          with: {
            memberships: {
              with: {
                appUser: {
                  columns: { id: true, fullName: true },
                  with: {
                    emails: {
                      columns: { email: true, verifiedAt: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: (t, { asc }) => [asc(t.createdAt)],
        }),
        db.query.Organization.findMany({
          where: (t, { isNull }) => isNull(t.approvedAt),
          columns: {
            id: true,
            name: true,
            slug: true,
            description: true,
            type: true,
            createdAt: true,
          },
          with: {
            memberships: {
              with: {
                appUser: {
                  columns: { id: true, fullName: true },
                  with: {
                    emails: {
                      columns: { email: true, verifiedAt: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: (t, { asc }) => [asc(t.createdAt)],
        }),
        db.select({ cnt: count() }).from(AppUser),
      ]);

    const userCount = userCountRows[0]?.cnt ?? 0;

    // Filter membership to admin only, take first, filter verified emails
    const channels = pendingChannels.map((channel) => {
      const adminMemberships = channel.memberships
        .filter((m) => m.isAdmin)
        .slice(0, 1)
        .map((m) => ({
          ...m,
          appUser: {
            ...m.appUser,
            emails: m.appUser.emails
              .filter((e) => e.verifiedAt !== null)
              .slice(0, 1),
          },
        }));
      return { ...channel, memberships: adminMemberships };
    });

    const organizations = pendingOrganizations.map((org) => {
      const adminMemberships = org.memberships
        .filter((m) => m.isAdmin)
        .slice(0, 1)
        .map((m) => ({
          ...m,
          appUser: {
            ...m.appUser,
            emails: m.appUser.emails
              .filter((e) => e.verifiedAt !== null)
              .slice(0, 1),
          },
        }));
      return { ...org, memberships: adminMemberships };
    });

    return {
      channels,
      organizations,
      userCount,
    };
  }),

  getPendingChannelApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending channel approvals');

    const channels = await db.query.Channel.findMany({
      where: (t, { isNull }) => isNull(t.approvedAt),
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        avatarPath: true,
        visibility: true,
      },
      with: {
        memberships: {
          with: {
            appUser: {
              columns: { id: true, fullName: true },
              with: {
                emails: {
                  columns: { email: true, verifiedAt: true },
                },
              },
            },
          },
        },
      },
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    return channels.map((channel) => {
      const { avatarPath, ...channelWithoutPath } = channel;
      const avatarUrl = avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
            resize: mantineAvatarSm2x,
          })
        : null;

      const adminMemberships = channel.memberships
        .filter((m) => m.isAdmin)
        .slice(0, 1)
        .map((m) => ({
          ...m,
          appUser: {
            ...m.appUser,
            emails: m.appUser.emails
              .filter((e) => e.verifiedAt !== null)
              .slice(0, 1),
          },
        }));

      return {
        ...channelWithoutPath,
        avatarUrl,
        memberships: adminMemberships,
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

      // Build where conditions
      const buildChannelWhere = (filter?: string, search?: string) => {
        const conditions = [];

        if (filter === 'pending') {
          conditions.push(isNull(Channel.approvedAt));
        } else if (filter === 'approved') {
          conditions.push(isNotNull(Channel.approvedAt));
        }

        if (search) {
          const escapedSearch = escapeLikePattern(search);
          conditions.push(
            or(
              ilike(Channel.name, `%${escapedSearch}%`),
              ilike(Channel.slug, `%${escapedSearch}%`),
            ),
          );
        }

        return conditions.length > 0 ? and(...conditions) : undefined;
      };

      const whereCondition = buildChannelWhere(input?.filter, input?.search);

      const [
        channels,
        totalCountRows,
        pendingCountRows,
        approvedCountRows,
        uploadCountRows,
        subscriberCountRows,
      ] = await Promise.all([
        db.query.Channel.findMany({
          columns: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
            approvedAt: true,
            deletedAt: true,
            avatarPath: true,
            visibility: true,
          },
          where: whereCondition ? () => whereCondition : undefined,
          with: {
            memberships: {
              with: {
                appUser: {
                  columns: { id: true, fullName: true },
                  with: {
                    emails: {
                      columns: { email: true, verifiedAt: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        }),
        db.select({ cnt: count() }).from(Channel).where(whereCondition),
        db
          .select({ cnt: count() })
          .from(Channel)
          .where(isNull(Channel.approvedAt)),
        db
          .select({ cnt: count() })
          .from(Channel)
          .where(isNotNull(Channel.approvedAt)),
        db
          .select({
            channelId: UploadRecord.channelId,
            cnt: count().as('upload_cnt'),
          })
          .from(UploadRecord)
          .groupBy(UploadRecord.channelId),
        db
          .select({
            channelId: ChannelSubscription.channelId,
            cnt: count().as('subscriber_cnt'),
          })
          .from(ChannelSubscription)
          .groupBy(ChannelSubscription.channelId),
      ]);

      const totalCount = totalCountRows[0]?.cnt ?? 0;
      const pendingCount = pendingCountRows[0]?.cnt ?? 0;
      const approvedCount = approvedCountRows[0]?.cnt ?? 0;

      const uploadCountMap = new Map(
        uploadCountRows.map((r) => [r.channelId, Number(r.cnt)]),
      );
      const subscriberCountMap = new Map(
        subscriberCountRows.map((r) => [r.channelId, Number(r.cnt)]),
      );

      const channelsWithAvatarUrl = channels.map((channel) => {
        const { avatarPath, memberships, ...channelWithoutPath } = channel;
        const avatarUrl = avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
              resize: mantineAvatarSm2x,
            })
          : null;

        const adminMemberships = memberships
          .filter((m) => m.isAdmin)
          .slice(0, 1)
          .map((m) => ({
            ...m,
            appUser: {
              ...m.appUser,
              emails: m.appUser.emails
                .filter((e) => e.verifiedAt !== null)
                .slice(0, 1),
            },
          }));

        return {
          ...channelWithoutPath,
          avatarUrl,
          memberships: adminMemberships,
          _count: {
            uploadRecords: uploadCountMap.get(channel.id) ?? 0,
            subscribers: subscriberCountMap.get(channel.id) ?? 0,
          },
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

    const organizations = await db.query.Organization.findMany({
      where: (t, { isNull }) => isNull(t.approvedAt),
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        type: true,
        createdAt: true,
        avatarPath: true,
      },
      with: {
        memberships: {
          with: {
            appUser: {
              columns: { id: true, fullName: true },
              with: {
                emails: {
                  columns: { email: true, verifiedAt: true },
                },
              },
            },
          },
        },
      },
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    return organizations.map((org) => {
      const { avatarPath, ...orgWithoutPath } = org;
      const avatarUrl = avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
            resize: mantineAvatarSm2x,
          })
        : null;

      const adminMemberships = org.memberships
        .filter((m) => m.isAdmin)
        .slice(0, 1)
        .map((m) => ({
          ...m,
          appUser: {
            ...m.appUser,
            emails: m.appUser.emails
              .filter((e) => e.verifiedAt !== null)
              .slice(0, 1),
          },
        }));

      return {
        ...orgWithoutPath,
        avatarUrl,
        memberships: adminMemberships,
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
        await db
          .update(Channel)
          .set({
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
            updatedAt: new Date(),
          })
          .where(eq(Channel.id, input.channelId));

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
        await db
          .update(Organization)
          .set({
            approvedAt: new Date(),
            approvedById: ctx.session.appUserId,
            updatedAt: new Date(),
          })
          .where(eq(Organization.id, input.organizationId));

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

      const buildOrgWhere = (filter?: string, search?: string) => {
        const conditions = [];

        if (filter === 'pending') {
          conditions.push(isNull(Organization.approvedAt));
        } else if (filter === 'approved') {
          conditions.push(isNotNull(Organization.approvedAt));
        } else if (filter === 'churches') {
          conditions.push(eq(Organization.type, 'CHURCH'));
        } else if (filter === 'ministries') {
          conditions.push(eq(Organization.type, 'MINISTRY'));
        }

        if (search) {
          const escapedSearch = escapeLikePattern(search);
          conditions.push(
            or(
              ilike(Organization.name, `%${escapedSearch}%`),
              ilike(Organization.slug, `%${escapedSearch}%`),
            ),
          );
        }

        return conditions.length > 0 ? and(...conditions) : undefined;
      };

      const whereCondition = buildOrgWhere(input?.filter, input?.search);

      const [
        organizations,
        totalCountRows,
        pendingCountRows,
        approvedCountRows,
        churchCountRows,
        ministryCountRows,
      ] = await Promise.all([
        db.query.Organization.findMany({
          columns: {
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
          },
          where: whereCondition ? () => whereCondition : undefined,
          with: {
            memberships: {
              with: {
                appUser: {
                  columns: { id: true, fullName: true },
                  with: {
                    emails: {
                      columns: { email: true, verifiedAt: true },
                    },
                  },
                },
              },
            },
            addresses: {
              columns: {
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
          },
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        }),
        db.select({ cnt: count() }).from(Organization).where(whereCondition),
        db
          .select({ cnt: count() })
          .from(Organization)
          .where(isNull(Organization.approvedAt)),
        db
          .select({ cnt: count() })
          .from(Organization)
          .where(isNotNull(Organization.approvedAt)),
        db
          .select({ cnt: count() })
          .from(Organization)
          .where(eq(Organization.type, 'CHURCH')),
        db
          .select({ cnt: count() })
          .from(Organization)
          .where(eq(Organization.type, 'MINISTRY')),
      ]);

      const totalCount = totalCountRows[0]?.cnt ?? 0;
      const pendingCount = pendingCountRows[0]?.cnt ?? 0;
      const approvedCount = approvedCountRows[0]?.cnt ?? 0;
      const churchCount = churchCountRows[0]?.cnt ?? 0;
      const ministryCount = ministryCountRows[0]?.cnt ?? 0;

      const channelAssocCountRows =
        organizations.length > 0
          ? await db
              .select({
                organizationId: OrganizationChannelAssociation.organizationId,
                cnt: count(),
              })
              .from(OrganizationChannelAssociation)
              .where(
                inArray(
                  OrganizationChannelAssociation.organizationId,
                  organizations.map((o) => o.id),
                ),
              )
              .groupBy(OrganizationChannelAssociation.organizationId)
          : [];
      const channelAssocCountMap = new Map(
        channelAssocCountRows.map((r) => [r.organizationId, Number(r.cnt)]),
      );

      const organizationsWithAvatarUrl = organizations.map((org) => {
        const { avatarPath, memberships, ...orgWithoutPath } = org;
        const avatarUrl = avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(avatarPath), {
              resize: mantineAvatarSm2x,
            })
          : null;

        const adminMemberships = memberships
          .filter((m) => m.isAdmin)
          .slice(0, 1)
          .map((m) => ({
            ...m,
            appUser: {
              ...m.appUser,
              emails: m.appUser.emails
                .filter((e) => e.verifiedAt !== null)
                .slice(0, 1),
            },
          }));

        return {
          ...orgWithoutPath,
          avatarUrl,
          memberships: adminMemberships,
          _count: {
            channelAssociations: channelAssocCountMap.get(org.id) ?? 0,
            memberships: memberships.length,
          },
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
        const organization = await db.query.Organization.findFirst({
          where: (t, { eq }) => eq(t.id, input.organizationId),
          columns: { id: true },
          with: {
            addresses: {
              columns: { id: true, latitude: true, longitude: true },
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
        await db
          .update(OrganizationAddress)
          .set({
            latitude: null,
            longitude: null,
            geocodingJson: null,
          })
          .where(eq(OrganizationAddress.organizationId, input.organizationId));

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
        await db
          .delete(Organization)
          .where(eq(Organization.id, input.organizationId));

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

    return db.query.OrganizationTag.findMany({
      columns: {
        slug: true,
        label: true,
        description: true,
        category: true,
        color: true,
      },
      orderBy: (t, { asc }) => [asc(t.category), asc(t.label)],
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
        const [tag] = await db
          .insert(OrganizationTag)
          .values({
            slug: input.slug,
            label: input.label,
            description: input.description,
            category: input.category,
            color: input.color,
          })
          .onConflictDoUpdate({
            target: OrganizationTag.slug,
            set: {
              label: input.label,
              description: input.description,
              category: input.category,
              color: input.color,
            },
          })
          .returning();

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            context: {
              tagSlug: tag?.slug,
            },
          },
          'Organization tag upserted successfully',
        );

        if (!tag) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }
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
        await db
          .delete(OrganizationTag)
          .where(eq(OrganizationTag.slug, input.slug));

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

    return db.query.AppUser.findMany({
      columns: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
      with: {
        emails: {
          columns: { email: true, verifiedAt: true },
        },
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }),

  getUserCount: adminProcedure.query(async () => {
    moduleLogger.info('Fetching user count');

    const rows = await db.select({ cnt: count() }).from(AppUser);
    return rows[0]?.cnt ?? 0;
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

        const user = await db.transaction(async (tx) => {
          const [newUser] = await tx
            .insert(AppUser)
            .values({
              username: input.username,
              password: hashedPassword,
              fullName: input.fullName,
              role: input.role,
              updatedAt: new Date(),
            })
            .returning({
              id: AppUser.id,
              username: AppUser.username,
              fullName: AppUser.fullName,
              role: AppUser.role,
              createdAt: AppUser.createdAt,
            });

          if (!newUser) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
          }

          await tx.insert(AppUserEmail).values({
            appUserId: newUser.id,
            email: input.email,
            verifiedAt: new Date(),
          });

          const emails = await tx.query.AppUserEmail.findMany({
            where: (t, { and, eq, isNotNull }) =>
              and(eq(t.appUserId, newUser.id), isNotNull(t.verifiedAt)),
            columns: { email: true, verifiedAt: true },
            limit: 1,
          });

          return { ...newUser, emails };
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
          updatedAt: Date;
        } = { updatedAt: new Date() };
        if (input.username) updateData.username = input.username;
        if (input.fullName !== undefined) updateData.fullName = input.fullName;
        if (input.role) updateData.role = input.role;

        const [updatedUser] = await db
          .update(AppUser)
          .set(updateData)
          .where(eq(AppUser.id, input.appUserId))
          .returning({
            id: AppUser.id,
            username: AppUser.username,
            fullName: AppUser.fullName,
            role: AppUser.role,
            createdAt: AppUser.createdAt,
          });

        if (input.email) {
          // Target a single row by primary key to avoid updating all verified emails
          const targetEmail = await db.query.AppUserEmail.findFirst({
            where: (t, { and, eq, isNotNull }) =>
              and(eq(t.appUserId, input.appUserId), isNotNull(t.verifiedAt)),
            columns: { id: true },
            orderBy: (t, { desc }) => desc(t.verifiedAt),
          });
          if (targetEmail) {
            await db
              .update(AppUserEmail)
              .set({ email: input.email })
              .where(eq(AppUserEmail.id, targetEmail.id));
          }
        }

        // Fetch verified emails (take 1)
        const emails = await db.query.AppUserEmail.findMany({
          where: (t, { and, eq, isNotNull }) =>
            and(eq(t.appUserId, input.appUserId), isNotNull(t.verifiedAt)),
          columns: { email: true, verifiedAt: true },
          limit: 1,
        });

        if (!updatedUser) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }
        const user = { ...updatedUser, emails };

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
        const user = await db.query.AppUser.findFirst({
          where: (t, { eq }) => eq(t.id, input.userId),
          columns: { id: true, username: true },
          with: {
            emails: {
              columns: { email: true, key: true },
              limit: 1,
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
        const user = await db.query.AppUser.findFirst({
          where: (t, { eq }) => eq(t.id, input.userId),
          columns: { id: true, username: true },
          with: {
            emails: {
              columns: { email: true, verifiedAt: true },
            },
          },
        });

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        const unverifiedEmails = user.emails.filter((e) => !e.verifiedAt);

        if (unverifiedEmails.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'User has no unverified email addresses',
          });
        }

        const temporalClient = await client;
        await Promise.all(
          unverifiedEmails.map((emailRecord) =>
            temporalClient.workflow.start(postUserRegistrationWorkflow, {
              args: [
                {
                  userId: user.id,
                  username: user.username,
                  email: emailRecord.email,
                  subscribeToNewsletter: false,
                },
              ],
              workflowId: `resend-verification:${user.id}:${emailRecord.email}:${Date.now()}`,
              taskQueue: BACKGROUND_QUEUE,
            }),
          ),
        );

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
      const allProcessingUploads = await db.query.UploadRecord.findMany({
        columns: { finalizedUploadKey: true },
        where: (t, { or, isNull }) =>
          or(isNull(t.transcodingFinishedAt), isNull(t.transcribingFinishedAt)),
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
      const allProcessingUploads = await db.query.UploadRecord.findMany({
        columns: {
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
        },
        where: (t, { or, isNull }) =>
          or(isNull(t.transcodingFinishedAt), isNull(t.transcribingFinishedAt)),
        with: {
          channel: {
            columns: { id: true, name: true, slug: true },
          },
        },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
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

    const featuredUploads = await db.query.FeaturedUpload.findMany({
      columns: {
        uploadRecordId: true,
        rank: true,
        createdAt: true,
      },
      with: {
        uploadRecord: {
          columns: {
            id: true,
            title: true,
            description: true,
            lengthSeconds: true,
            defaultThumbnailPath: true,
            overrideThumbnailPath: true,
            defaultThumbnailBlurhash: true,
            overrideThumbnailBlurhash: true,
          },
          with: {
            channel: {
              columns: {
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
      orderBy: (t, { asc }) => [asc(t.rank)],
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
        const upload = await db.query.UploadRecord.findFirst({
          where: (t, { eq }) => eq(t.id, input.uploadId),
          columns: {
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
        const existing = await db.query.FeaturedUpload.findFirst({
          where: (t, { eq }) => eq(t.uploadRecordId, input.uploadId),
        });

        if (existing) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload is already featured',
          });
        }

        // Get max rank and insert atomically to avoid rank collisions
        const [featuredUpload, newRank] = await db.transaction(async (tx) => {
          const maxRankRow = await tx.query.FeaturedUpload.findFirst({
            columns: { rank: true },
            orderBy: (t, { desc }) => [desc(t.rank)],
          });
          const rank = (maxRankRow?.rank ?? -1) + 1;
          const [row] = await tx
            .insert(FeaturedUpload)
            .values({
              uploadRecordId: input.uploadId,
              rank,
              updatedAt: new Date(),
            })
            .returning();
          return [row, rank] as const;
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

        if (!featuredUpload) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }
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
        const featuredUpload = await db.query.FeaturedUpload.findFirst({
          where: (t, { eq }) => eq(t.uploadRecordId, input.uploadId),
          columns: { rank: true },
        });

        if (!featuredUpload) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Featured upload not found',
          });
        }

        // Delete the featured upload and rebalance ranks atomically
        await db.transaction(async (tx) => {
          await tx
            .delete(FeaturedUpload)
            .where(eq(FeaturedUpload.uploadRecordId, input.uploadId));

          await tx
            .update(FeaturedUpload)
            .set({ rank: sql`${FeaturedUpload.rank} - 1` })
            .where(gt(FeaturedUpload.rank, featuredUpload.rank));
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
        const existingFeatured = await db.query.FeaturedUpload.findMany({
          columns: { uploadRecordId: true },
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
            db
              .update(FeaturedUpload)
              .set({ rank: index, updatedAt: new Date() })
              .where(eq(FeaturedUpload.uploadRecordId, uploadId)),
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
        const existing = await db.query.FeaturedUpload.findFirst({
          where: (t, { eq }) => eq(t.uploadRecordId, input.uploadId),
        });

        if (existing) {
          // Remove from featured and rebalance ranks atomically
          await db.transaction(async (tx) => {
            await tx
              .delete(FeaturedUpload)
              .where(eq(FeaturedUpload.uploadRecordId, input.uploadId));

            await tx
              .update(FeaturedUpload)
              .set({ rank: sql`${FeaturedUpload.rank} - 1` })
              .where(gt(FeaturedUpload.rank, existing.rank));
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
        const upload = await db.query.UploadRecord.findFirst({
          where: (t, { eq }) => eq(t.id, input.uploadId),
          columns: {
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

        // Shift all existing ranks up and insert at rank 0 (top of list)
        const newRank = await db.transaction(async (tx) => {
          await tx
            .update(FeaturedUpload)
            .set({ rank: sql`${FeaturedUpload.rank} + 1` });
          await tx.insert(FeaturedUpload).values({
            uploadRecordId: input.uploadId,
            rank: 0,
            updatedAt: new Date(),
          });
          return 0;
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
      statusCountRows,
      totalStorageRows,
      nullSizeBytesCountRows,
      backfillProgress,
      backfillSizesProgress,
      bulkBackupProgress,
      cleanupProgress,
    ] = await Promise.all([
      db
        .select({ backupStatus: UploadState.backupStatus, cnt: count() })
        .from(UploadState)
        .groupBy(UploadState.backupStatus),
      db.select({ total: sum(UploadState.sizeBytes) }).from(UploadState),
      db
        .select({ cnt: count() })
        .from(UploadState)
        .where(isNull(UploadState.sizeBytes)),
      getBackfillUploadStatesProgress(),
      getBackfillUploadStateSizesProgress(),
      getBulkBackupToGlacierProgress(),
      getCleanupStaleUploadStatesProgress(),
    ]);

    const nullSizeBytesCount = nullSizeBytesCountRows[0]?.cnt ?? 0;

    const stats = {
      notBackedUp: 0,
      backingUp: 0,
      backedUp: 0,
      backupFailed: 0,
      total: 0,
      totalStorageBytes: totalStorageRows[0]?.total?.toString() ?? '0',
      nullSizeBytesCount,
    };

    for (const result of statusCountRows) {
      stats.total += result.cnt;
      switch (result.backupStatus) {
        case 'NOT_BACKED_UP':
          stats.notBackedUp = result.cnt;
          break;
        case 'BACKING_UP':
          stats.backingUp = result.cnt;
          break;
        case 'BACKED_UP':
          stats.backedUp = result.cnt;
          break;
        case 'BACKUP_FAILED':
          stats.backupFailed = result.cnt;
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
    const [remainingCountRows, progress] = await Promise.all([
      db
        .select({ cnt: count() })
        .from(UploadRecord)
        .where(
          and(
            eq(UploadRecord.uploadFinalized, true),
            isNotNull(UploadRecord.finalizedUploadKey),
            isNull(UploadRecord.originalFileName),
          ),
        ),
      getBackfillFilenamesProgress(),
    ]);

    return {
      remainingCount: remainingCountRows[0]?.cnt ?? 0,
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

      const [failedBackups, totalCountRows] = await Promise.all([
        db.query.UploadState.findMany({
          where: (t, { eq }) => eq(t.backupStatus, 'BACKUP_FAILED'),
          orderBy: (t, { desc }) => [desc(t.updatedAt)],
          limit: input.limit,
          offset: input.offset,
          columns: {
            id: true,
            s3Key: true,
            s3Bucket: true,
            uploadType: true,
            sizeBytes: true,
            createdAt: true,
            updatedAt: true,
          },
          with: {
            uploadRecord: {
              columns: { id: true, title: true },
            },
          },
        }),
        db
          .select({ cnt: count() })
          .from(UploadState)
          .where(eq(UploadState.backupStatus, 'BACKUP_FAILED')),
      ]);

      return {
        failedBackups,
        totalCount: totalCountRows[0]?.cnt ?? 0,
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
        const uploadState = await db.query.UploadState.findFirst({
          where: (t, { eq }) => eq(t.id, input.uploadStateId),
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

        await db
          .update(UploadState)
          .set({
            backupStatus: 'NOT_BACKED_UP',
            backupKey: null,
            backedUpAt: null,
            updatedAt: new Date(),
          })
          .where(eq(UploadState.id, input.uploadStateId));

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
      const result = await db
        .update(UploadState)
        .set({
          backupStatus: 'NOT_BACKED_UP',
          backupKey: null,
          backedUpAt: null,
          updatedAt: new Date(),
        })
        .where(eq(UploadState.backupStatus, 'BACKUP_FAILED'))
        .returning({ id: UploadState.id });

      moduleLogger.info(
        {
          context: {
            count: result.length,
          },
        },
        'Successfully reset all failed backups to NOT_BACKED_UP',
      );

      return { success: true, count: result.length };
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
      const failedUploads = await db.query.UploadRecord.findMany({
        where: (t, { and, or, eq, isNull, isNotNull }) =>
          and(
            eq(t.uploadFinalized, true),
            isNotNull(t.finalizedUploadKey),
            or(
              and(
                isNull(t.transcodingStartedAt),
                isNull(t.transcodingFinishedAt),
              ),
              and(
                isNotNull(t.transcodingStartedAt),
                isNull(t.transcodingFinishedAt),
              ),
              and(
                isNotNull(t.transcribingStartedAt),
                isNull(t.transcribingFinishedAt),
              ),
            ),
          ),
        columns: { finalizedUploadKey: true },
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
        const failedUploads = await db.query.UploadRecord.findMany({
          where: (t, { and, or, eq, isNull, isNotNull }) =>
            and(
              eq(t.uploadFinalized, true),
              isNotNull(t.finalizedUploadKey),
              or(
                and(
                  isNull(t.transcodingStartedAt),
                  isNull(t.transcodingFinishedAt),
                ),
                and(
                  isNotNull(t.transcodingStartedAt),
                  isNull(t.transcodingFinishedAt),
                ),
                and(
                  isNotNull(t.transcribingStartedAt),
                  isNull(t.transcribingFinishedAt),
                ),
              ),
            ),
          columns: {
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
          },
          with: {
            channel: {
              columns: { id: true, name: true, slug: true },
            },
            createdBy: {
              columns: { id: true, username: true, fullName: true },
            },
          },
          orderBy: (t, { desc }) => [desc(t.uploadFinalizedAt)],
          limit: input.limit,
          offset: input.offset,
        });

        const totalCountRows = await db
          .select({ cnt: count() })
          .from(UploadRecord)
          .where(
            and(
              eq(UploadRecord.uploadFinalized, true),
              isNotNull(UploadRecord.finalizedUploadKey),
              or(
                and(
                  isNull(UploadRecord.transcodingStartedAt),
                  isNull(UploadRecord.transcodingFinishedAt),
                ),
                and(
                  isNotNull(UploadRecord.transcodingStartedAt),
                  isNull(UploadRecord.transcodingFinishedAt),
                ),
                and(
                  isNotNull(UploadRecord.transcribingStartedAt),
                  isNull(UploadRecord.transcribingFinishedAt),
                ),
              ),
            ),
          );

        const totalCount = totalCountRows[0]?.cnt ?? 0;

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
        const upload = await db.query.UploadRecord.findFirst({
          where: (t, { eq }) => eq(t.id, input.uploadRecordId),
          columns: {
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
        const workflowId = makeProcessMediaWorkflowId(
          upload.finalizedUploadKey,
        );

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

        // Start the workflow
        await temporalClient.workflow.start(processMediaWorkflow, {
          taskQueue: BACKGROUND_QUEUE,
          workflowId,
          args: [input.uploadRecordId, scope],
          priority: { priorityKey: PRIORITY_RETRY },
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
      const processingUploads = await db.query.UploadRecord.findMany({
        where: (t, { and, eq, isNotNull, or, isNull }) =>
          and(
            eq(t.uploadFinalized, true),
            isNotNull(t.finalizedUploadKey),
            or(
              isNull(t.transcodingFinishedAt),
              isNull(t.transcribingFinishedAt),
            ),
          ),
        columns: {
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

          await db
            .update(UploadRecord)
            .set({
              transcodingStartedAt: null,
              transcodingFinishedAt: null,
              transcribingStartedAt: null,
              transcribingFinishedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(UploadRecord.id, upload.id));

          moduleLogger.info(
            {
              uploadId: upload.id,
            },
            'Bulk retry: Reset upload record timestamps',
          );

          if (!upload.finalizedUploadKey) {
            moduleLogger.warn(
              { uploadId: upload.id },
              'Upload missing finalizedUploadKey, skipping',
            );
            continue;
          }

          const workflowId = makeProcessMediaWorkflowId(
            upload.finalizedUploadKey,
          );
          await temporalClient.workflow.start(processMediaWorkflow, {
            taskQueue: BACKGROUND_QUEUE,
            workflowId,
            args: [upload.id, scope],
            priority: { priorityKey: PRIORITY_RETRY },
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

      const [searchLogs, totalCountRows] = await Promise.all([
        db.query.SearchLogEntry.findMany({
          where: (t, { isNull }) => isNull(t.userDeletedAt),
          columns: {
            id: true,
            query: true,
            params: true,
            createdAt: true,
            mediaCount: true,
            transcriptCount: true,
            channelCount: true,
          },
          with: {
            appUser: {
              columns: { id: true, username: true, fullName: true },
            },
          },
          orderBy: (t, { desc }) => [desc(t.createdAt)],
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ cnt: count() })
          .from(SearchLogEntry)
          .where(isNull(SearchLogEntry.userDeletedAt)),
      ]);

      return {
        searchLogs,
        totalCount: totalCountRows[0]?.cnt ?? 0,
      };
    }),

  getDeletingUploadsCount: adminProcedure.query(async () => {
    moduleLogger.info('Fetching deleting uploads count');

    try {
      const rows = await db
        .select({ cnt: count() })
        .from(UploadRecord)
        .where(isNotNull(UploadRecord.deletedAt));

      return rows[0]?.cnt ?? 0;
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
        const [deletingUploads, totalCountRows] = await Promise.all([
          db.query.UploadRecord.findMany({
            where: (t, { isNotNull }) => isNotNull(t.deletedAt),
            columns: {
              id: true,
              title: true,
              description: true,
              createdAt: true,
              deletedAt: true,
              uploadFinalizedAt: true,
            },
            with: {
              channel: {
                columns: { id: true, name: true, slug: true },
              },
              createdBy: {
                columns: { id: true, username: true, fullName: true },
              },
            },
            orderBy: (t, { desc }) => [desc(t.deletedAt)],
            limit: input.limit,
            offset: input.offset,
          }),
          db
            .select({ cnt: count() })
            .from(UploadRecord)
            .where(isNotNull(UploadRecord.deletedAt)),
        ]);

        return {
          uploads: deletingUploads,
          totalCount: totalCountRows[0]?.cnt ?? 0,
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

  getDuplicateUploads: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        matchPublishedAt: z.boolean().default(true),
      }),
    )
    .query(async ({ input }) => {
      moduleLogger.info('Fetching duplicate uploads', {
        matchPublishedAt: input.matchPublishedAt,
      });

      // When matchPublishedAt is true, group by (channelId, title, publishedAt)
      // so that uploads with the same title but different air dates are not
      // treated as duplicates (e.g. weekly sermons with a generic title).
      const rows = input.matchPublishedAt
        ? await db.execute(sql`
            WITH dup_keys AS (
              SELECT channel_id, title, published_at
              FROM upload_record
              WHERE deleted_at IS NULL
              GROUP BY channel_id, title, published_at
              HAVING COUNT(*) > 1
              ORDER BY COUNT(*) DESC, title
              LIMIT ${input.limit} OFFSET ${input.offset}
            ),
            dup_key_counts AS (
              SELECT COUNT(*)::int AS total FROM dup_keys
            )
            SELECT
              ur.id,
              ur.title,
              ur.created_at,
              ur.published_at,
              c.id   AS channel_id,
              c.name AS channel_name,
              c.slug AS channel_slug,
              (SELECT total FROM dup_key_counts) AS group_count
            FROM upload_record ur
            JOIN channel c ON c.id = ur.channel_id
            WHERE ur.deleted_at IS NULL
              AND (ur.channel_id, ur.title, ur.published_at) IN (
                SELECT channel_id, title, published_at FROM dup_keys
              )
            ORDER BY ur.channel_id, ur.title, ur.published_at, ur.created_at
          `)
        : await db.execute(sql`
            WITH dup_keys AS (
              SELECT channel_id, title
              FROM upload_record
              WHERE deleted_at IS NULL
              GROUP BY channel_id, title
              HAVING COUNT(*) > 1
              ORDER BY COUNT(*) DESC, title
              LIMIT ${input.limit} OFFSET ${input.offset}
            ),
            dup_key_counts AS (
              SELECT COUNT(*)::int AS total FROM dup_keys
            )
            SELECT
              ur.id,
              ur.title,
              ur.created_at,
              ur.published_at,
              c.id   AS channel_id,
              c.name AS channel_name,
              c.slug AS channel_slug,
              (SELECT total FROM dup_key_counts) AS group_count
            FROM upload_record ur
            JOIN channel c ON c.id = ur.channel_id
            WHERE ur.deleted_at IS NULL
              AND (ur.channel_id, ur.title) IN (SELECT channel_id, title FROM dup_keys)
            ORDER BY ur.channel_id, ur.title, ur.created_at
          `);

      type Row = {
        id: string;
        title: string | null;
        created_at: Date;
        published_at: Date | null;
        channel_id: string;
        channel_name: string;
        channel_slug: string;
        group_count: number;
      };

      const typedRows = rows.rows as Row[];
      const groupCount = typedRows[0]?.group_count ?? 0;

      const groupMap = new Map<
        string,
        {
          channelId: string;
          channelName: string;
          channelSlug: string;
          title: string | null;
          publishedAt: Date | null;
          uploads: {
            id: string;
            createdAt: Date;
            publishedAt: Date | null;
          }[];
        }
      >();

      for (const row of typedRows) {
        const key = input.matchPublishedAt
          ? `${row.channel_id}::${row.title ?? ''}::${String(row.published_at ?? '')}`
          : `${row.channel_id}::${row.title ?? ''}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            channelId: row.channel_id,
            channelName: row.channel_name,
            channelSlug: row.channel_slug,
            title: row.title,
            publishedAt: row.published_at,
            uploads: [],
          });
        }
        groupMap.get(key)?.uploads.push({
          id: row.id,
          createdAt: row.created_at,
          publishedAt: row.published_at,
        });
      }

      return {
        groups: Array.from(groupMap.values()),
        totalGroups: groupCount,
      };
    }),

  deleteDuplicateUpload: adminProcedure
    .input(z.object({ uploadId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const upload = await db.query.UploadRecord.findFirst({
        columns: { id: true },
        where: (t, { eq }) => eq(t.id, input.uploadId),
      });

      if (!upload) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Upload not found',
        });
      }

      await deleteUpload(input.uploadId);

      return { success: true };
    }),

  newsletterLists: newsletterListsRouter,

  getReindexStatus: adminProcedure.query(async () => {
    const kinds: ReindexKind[] = [
      'upload',
      'transcriptHtml',
      'channel',
      'organization',
    ];
    const statuses = await Promise.all(
      kinds.map(async (kind) => ({
        kind,
        progress: await getReindexProgress(kind),
      })),
    );
    return Object.fromEntries(
      statuses.map(({ kind, progress }) => [kind, progress]),
    ) as Record<ReindexKind, Awaited<ReturnType<typeof getReindexProgress>>>;
  }),

  startReindex: adminProcedure
    .input(
      z.object({
        kind: z.enum(['upload', 'transcriptHtml', 'channel', 'organization']),
        batchSize: z.number().min(1).max(500).default(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, context: { kind: input.kind } },
        'Starting reindex',
      );

      try {
        const current = await getReindexProgress(input.kind);
        if (current?.status === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Reindex for ${input.kind} is already running`,
          });
        }

        await startReindex({ kind: input.kind, batchSize: input.batchSize });
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              kind: input.kind,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start reindex',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start reindex',
        });
      }
    }),

  cancelReindex: adminProcedure
    .input(
      z.object({
        kind: z.enum(['upload', 'transcriptHtml', 'channel', 'organization']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, context: { kind: input.kind } },
        'Cancelling reindex',
      );
      try {
        await cancelReindex(input.kind);
        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              kind: input.kind,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to cancel reindex',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel reindex',
        });
      }
    }),

  // Reprocess procedures

  getReprocessStatus: adminProcedure.query(async () => {
    const [legacyCount, legacyStatus, allStatus] = await Promise.all([
      db
        .select({ cnt: count() })
        .from(UploadRecord)
        .where(
          and(
            lt(UploadRecord.pipelineVersion, CURRENT_PIPELINE_VERSION),
            isNotNull(UploadRecord.transcodingFinishedAt),
          ),
        )
        .then((r) => r[0]?.cnt ?? 0),
      getReprocessWorkflowStatus({ kind: 'legacy' }),
      getReprocessWorkflowStatus({ kind: 'all' }),
    ]);
    return { legacyCount, legacyStatus, allStatus };
  }),

  startReprocess: adminProcedure
    .input(
      z.object({
        scope: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('legacy') }),
          z.object({ kind: z.literal('all') }),
          z.object({ kind: z.literal('channel'), channelSlug: z.string() }),
        ]),
        processingScope: z
          .enum(['transcode', 'transcribe', 'everything'])
          .default('transcode'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            scope: input.scope,
            processingScope: input.processingScope,
          },
        },
        'Starting reprocess',
      );

      let scope: ReprocessScope;
      if (input.scope.kind === 'channel') {
        const { channelSlug } = input.scope;
        const channel = await db.query.Channel.findFirst({
          columns: { id: true },
          where: (t, { eq }) => eq(t.slug, channelSlug),
        });
        if (!channel) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Channel not found: ${channelSlug}`,
          });
        }
        scope = { kind: 'channel', channelId: channel.id };
      } else {
        scope = input.scope;
      }

      try {
        const current = await getReprocessWorkflowStatus(scope);
        if (current === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Reprocess workflow is already running for this scope',
          });
        }

        await startReprocess(scope, input.processingScope);
        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              scope: input.scope,
              error: err instanceof Error ? err.message : String(err),
            },
          },
          'Failed to start reprocess workflow',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start reprocess workflow',
        });
      }
    }),

  cancelReprocess: adminProcedure
    .input(
      z.object({
        scope: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('legacy') }),
          z.object({ kind: z.literal('all') }),
          z.object({ kind: z.literal('channel'), channelSlug: z.string() }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, context: { scope: input.scope } },
        'Cancelling reprocess',
      );

      let scope: ReprocessScope;
      if (input.scope.kind === 'channel') {
        const { channelSlug } = input.scope;
        const channel = await db.query.Channel.findFirst({
          columns: { id: true },
          where: (t, { eq }) => eq(t.slug, channelSlug),
        });
        if (!channel) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Channel not found: ${channelSlug}`,
          });
        }
        scope = { kind: 'channel', channelId: channel.id };
      } else {
        scope = input.scope;
      }

      try {
        await cancelReprocess(scope);
        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              scope: input.scope,
              error: err instanceof Error ? err.message : String(err),
            },
          },
          'Failed to cancel reprocess workflow',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel reprocess workflow',
        });
      }
    }),

  getChannelReprocessStatus: adminProcedure
    .input(z.object({ channelSlug: z.string() }))
    .query(async ({ input }) => {
      const channel = await db.query.Channel.findFirst({
        columns: { id: true },
        where: (t, { eq }) => eq(t.slug, input.channelSlug),
      });
      if (!channel) return null;
      const status = await getReprocessWorkflowStatus({
        kind: 'channel',
        channelId: channel.id,
      });
      return status;
    }),

  // Remux procedures

  getRemuxStatus: adminProcedure.query(async () => {
    const [legacyCount, legacyStatus] = await Promise.all([
      db
        .select({ cnt: count() })
        .from(UploadRecord)
        .where(
          and(
            lt(UploadRecord.pipelineVersion, CURRENT_PIPELINE_VERSION),
            isNotNull(UploadRecord.transcodingFinishedAt),
          ),
        )
        .then((r) => r[0]?.cnt ?? 0),
      getRemuxWorkflowStatus({ kind: 'legacy' }),
    ]);
    return { legacyCount, legacyStatus };
  }),

  startRemux: adminProcedure
    .input(
      z.object({
        scope: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('legacy') }),
          z.object({ kind: z.literal('channel'), channelSlug: z.string() }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, context: { scope: input.scope } },
        'Starting remux',
      );

      let scope: RemuxScope;
      if (input.scope.kind === 'channel') {
        const { channelSlug } = input.scope;
        const channel = await db.query.Channel.findFirst({
          columns: { id: true },
          where: (t, { eq }) => eq(t.slug, channelSlug),
        });
        if (!channel) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Channel not found: ${channelSlug}`,
          });
        }
        scope = { kind: 'channel', channelId: channel.id };
      } else {
        scope = input.scope;
      }

      try {
        const current = await getRemuxWorkflowStatus(scope);
        if (current === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Remux workflow is already running for this scope',
          });
        }

        await startRemuxAll(scope);
        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              scope: input.scope,
              error: err instanceof Error ? err.message : String(err),
            },
          },
          'Failed to start remux workflow',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start remux workflow',
        });
      }
    }),

  cancelRemux: adminProcedure
    .input(
      z.object({
        scope: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('legacy') }),
          z.object({ kind: z.literal('channel'), channelSlug: z.string() }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, context: { scope: input.scope } },
        'Cancelling remux',
      );

      let scope: RemuxScope;
      if (input.scope.kind === 'channel') {
        const { channelSlug } = input.scope;
        const channel = await db.query.Channel.findFirst({
          columns: { id: true },
          where: (t, { eq }) => eq(t.slug, channelSlug),
        });
        if (!channel) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Channel not found: ${channelSlug}`,
          });
        }
        scope = { kind: 'channel', channelId: channel.id };
      } else {
        scope = input.scope;
      }

      try {
        await cancelRemuxAll(scope);
        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              scope: input.scope,
              error: err instanceof Error ? err.message : String(err),
            },
          },
          'Failed to cancel remux workflow',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel remux workflow',
        });
      }
    }),

  getChannelRemuxStatus: adminProcedure
    .input(z.object({ channelSlug: z.string() }))
    .query(async ({ input }) => {
      const channel = await db.query.Channel.findFirst({
        columns: { id: true },
        where: (t, { eq }) => eq(t.slug, input.channelSlug),
      });
      if (!channel) return null;
      return getRemuxWorkflowStatus({ kind: 'channel', channelId: channel.id });
    }),
});
