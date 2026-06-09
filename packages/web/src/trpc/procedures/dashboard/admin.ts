import {
  AppUser,
  AppUserEmail,
  Channel,
  ChannelSubscription,
  db,
  FeaturedUpload,
  LlmCall,
  Organization,
  OrganizationAddress,
  OrganizationChannelAssociation,
  OrganizationTag,
  SearchLogEntry,
  StorageAudit,
  TranscriptParagraph,
  UploadRecord,
  UploadState,
} from '@letschurch/db';
import { ingestConfig, ingestS3 } from '@letschurch/s3/ingest';
import { publicS3 } from '@letschurch/s3/public';
import { runAnnotation } from '@letschurch/temporal/activities/background/annotate-transcript';
import type { StorageAuditSummary } from '@letschurch/temporal/activities/background/storage-audit';
import { runSummary } from '@letschurch/temporal/activities/background/summarize-upload';
import {
  BACKGROUND_QUEUE,
  PRIORITY_REPROCESS,
  PRIORITY_RETRY,
} from '@letschurch/temporal/queues';
import { UPLOAD_ID_KEY } from '@letschurch/temporal/search-attributes';
import {
  staticMeta,
  uploadDashboardLinks,
} from '@letschurch/temporal/util/dashboard-links';
import {
  ANNOTATE_MODEL,
  EMBED_MODEL,
  SUMMARY_MODEL,
} from '@letschurch/temporal/util/llm';
import { assertProductionPricingCoverage } from '@letschurch/temporal/util/llm-pricing';
import { TRPCError } from '@trpc/server';
import * as argon2 from 'argon2';
import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import { z } from 'zod';
import { usernameSchema } from '@/schemas/auth';
import { IncomingIdSchema } from '@/schemas/common';
import {
  addFeaturedUploadSchema,
  removeFeaturedUploadSchema,
  reorderFeaturedUploadsSchema,
  setMaintenanceModeSchema,
} from '@/schemas/dashboard/admin';
import {
  cancelBackfillFilenames,
  cancelBackfillUploadStateSizes,
  cancelBackfillUploadStates,
  cancelBulkBackupToGlacier,
  cancelCleanupStaleUploadStates,
  cancelReindex,
  cancelReprocess,
  client,
  deleteUpload,
  getBackfillFilenamesProgress,
  getBackfillUploadStateSizesProgress,
  getBackfillUploadStatesProgress,
  getBulkBackupToGlacierProgress,
  getCleanupStaleUploadStatesProgress,
  getQueueStats,
  getReindexProgress,
  getReprocessWorkflowStatus,
  getRunningWorkflowCount,
  getStorageAuditProgress,
  makeAnnotateTranscriptWorkflowId,
  makeProcessMediaWorkflowId,
  makeSummarizeUploadWorkflowId,
  type ReindexKind,
  type ReprocessScope,
  resetPassword,
  startBackfillFilenames,
  startBackfillUploadStateSizes,
  startBackfillUploadStates,
  startBackground,
  startBulkBackupToGlacier,
  startCleanupStaleUploadStates,
  startDeleteStorageAuditReport,
  startReindex,
  startReprocess,
  startStorageAudit,
} from '@/temporal';
import { mantineAvatarSm2x } from '@/util/avatar-sizes';
import { clearByPrefix } from '@/util/cache';
import logger from '@/util/logger';
import {
  getMaintenanceSettings,
  setMaintenanceConfig,
} from '@/util/maintenance';
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

// Mirror of the background-worker boot check, scoped to the web
// container's evaluateLlmModel surface + seed scripts that the
// background-worker assert doesn't reach. Fires once at server boot:
// `routeTree.gen.ts` does a synchronous static import of
// `routes/trpc.$.ts` → `appRouter` → `dashboardRouter` → `adminRouter`
// (this module), so the assertion runs when the route tree loads, well
// before any request hits `/trpc`. ESM caches the module so the warn
// fires exactly once per process.
assertProductionPricingCoverage({
  summary: SUMMARY_MODEL,
  annotate: ANNOTATE_MODEL,
  embed: EMBED_MODEL,
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

        const workflowHandle = await startBackground(
          'geocodeOrganizationWorkflow',
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
        const workflowHandle = await startBackground('deleteChannelWorkflow', {
          taskQueue: BACKGROUND_QUEUE,
          ...staticMeta({ summary: `Delete channel — ${input.channelName}` }),
          workflowId: `deleteChannel:${input.channelId}:${Date.now()}`,
          args: [input.channelId, input.channelName],
          retry: { maximumAttempts: 5 },
        });

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
        username: usernameSchema,
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
        username: usernameSchema.optional(),
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

        await Promise.all(
          unverifiedEmails.map((emailRecord) =>
            startBackground('postUserRegistrationWorkflow', {
              ...staticMeta({
                summary: `Resend verification — @${user.username}`,
              }),
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

  getQueueStats: adminProcedure.query(async () => {
    moduleLogger.info('Fetching Temporal queue stats');

    try {
      return await getQueueStats();
    } catch (error) {
      moduleLogger.error(
        {
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to fetch Temporal queue stats',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch Temporal queue stats',
      });
    }
  }),

  getRunningWorkflowCount: adminProcedure.query(async () => {
    moduleLogger.info('Fetching running workflow count');

    try {
      return await getRunningWorkflowCount();
    } catch (error) {
      moduleLogger.error(
        {
          context: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        'Failed to fetch running workflow count',
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch running workflow count',
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

        if (!upload.transcodingFinishedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload must finish transcoding before featuring',
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

  /**
   * Uploads whose annotation pipeline failed and never produced any OUTLINE
   * annotations. Surface for the admin failed-annotations page so an
   * operator can review the failure reason (typically OpenAI's content
   * filter on politically/theologically frank content, after which the
   * configured fallback model also failed) and decide whether to retry,
   * switch the configured fallback, or accept that this content can't be
   * annotated.
   *
   * "Failure" = the most recent `llm_call` row for this upload with
   * `activity='annotateTranscript'` has a non-success outcome (e.g.
   * `guard_content_filter`). Uploads that succeeded after a prior failure
   * are excluded by the "no OUTLINE annotation" filter below.
   */
  getFailedAnnotations: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const failedRows = await db
        .select({
          uploadId: UploadRecord.id,
          title: UploadRecord.title,
          channelId: Channel.id,
          channelName: Channel.name,
          channelSlug: Channel.slug,
          transcribingFinishedAt: UploadRecord.transcribingFinishedAt,
          model: LlmCall.model,
          outcome: LlmCall.outcome,
          errorMessage: LlmCall.errorMessage,
          lastAttemptAt: LlmCall.createdAt,
        })
        .from(UploadRecord)
        .innerJoin(Channel, eq(UploadRecord.channelId, Channel.id))
        .innerJoin(
          LlmCall,
          and(
            eq(LlmCall.uploadRecordId, UploadRecord.id),
            eq(LlmCall.activity, 'annotateTranscript'),
            // Latest llm_call for this upload + activity. NOT EXISTS a
            // later row for the same (upload, activity) pair.
            notExists(
              db
                .select({ one: sql<number>`1` })
                .from(sql`${LlmCall} AS later`)
                .where(
                  and(
                    sql`later.upload_record_id = ${UploadRecord.id}`,
                    sql`later.activity = 'annotateTranscript'`,
                    sql`later.created_at > ${LlmCall.createdAt}`,
                  ),
                ),
            ),
          ),
        )
        .where(
          and(
            isNotNull(UploadRecord.transcribingFinishedAt),
            // The join already restricts LlmCall to the most-recent
            // annotate call per upload; failing the success check here
            // means the latest attempt failed. We don't also check for
            // OUTLINE existence — a legal-but-zero-outline successful
            // run has `outcome='success'` so it's already excluded by
            // this same check, and uploads whose prior runs landed
            // outlines but whose most recent regenerate failed *should*
            // surface here so the admin knows the regen they kicked off
            // didn't take.
            sql`${LlmCall.outcome} != 'success'`,
          ),
        )
        .orderBy(desc(LlmCall.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        uploads: failedRows.map((row) => ({
          id: row.uploadId,
          title: row.title,
          channel: {
            id: row.channelId,
            name: row.channelName,
            slug: row.channelSlug,
          },
          transcribingFinishedAt: row.transcribingFinishedAt,
          lastAttempt: {
            model: row.model,
            outcome: row.outcome,
            errorMessage: row.errorMessage,
            at: row.lastAttemptAt,
          },
        })),
      };
    }),

  /** Count of failed-annotations matching `getFailedAnnotations` — backs
   * the admin-dashboard badge so the surface only shows up when there's
   * something to act on. Keeps the same join semantics as the list
   * procedure so the count matches what `getFailedAnnotations` returns. */
  getFailedAnnotationsCount: adminProcedure.query(async () => {
    const rows = await db
      .select({ cnt: count() })
      .from(UploadRecord)
      .innerJoin(
        LlmCall,
        and(
          eq(LlmCall.uploadRecordId, UploadRecord.id),
          eq(LlmCall.activity, 'annotateTranscript'),
          notExists(
            db
              .select({ one: sql<number>`1` })
              .from(sql`${LlmCall} AS later`)
              .where(
                and(
                  sql`later.upload_record_id = ${UploadRecord.id}`,
                  sql`later.activity = 'annotateTranscript'`,
                  sql`later.created_at > ${LlmCall.createdAt}`,
                ),
              ),
          ),
        ),
      )
      .where(
        and(
          isNotNull(UploadRecord.transcribingFinishedAt),
          sql`${LlmCall.outcome} != 'success'`,
        ),
      );
    return rows[0]?.cnt ?? 0;
  }),

  /**
   * Uploads whose most recent summarize attempt failed. Same shape as
   * `getFailedAnnotations` — gated purely on the most-recent
   * `activity='summarizeUpload'` `llm_call` having a non-success
   * outcome. Uploads whose prior summarize succeeded but whose most
   * recent regenerate failed are intentionally included; the admin
   * wants to know their regen didn't take. A successful retry rolls
   * forward the latest-llm_call pointer and drops the row from the
   * list.
   */
  getFailedSummaries: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const failedRows = await db
        .select({
          uploadId: UploadRecord.id,
          title: UploadRecord.title,
          channelId: Channel.id,
          channelName: Channel.name,
          channelSlug: Channel.slug,
          transcribingFinishedAt: UploadRecord.transcribingFinishedAt,
          model: LlmCall.model,
          outcome: LlmCall.outcome,
          errorMessage: LlmCall.errorMessage,
          lastAttemptAt: LlmCall.createdAt,
        })
        .from(UploadRecord)
        .innerJoin(Channel, eq(UploadRecord.channelId, Channel.id))
        .innerJoin(
          LlmCall,
          and(
            eq(LlmCall.uploadRecordId, UploadRecord.id),
            eq(LlmCall.activity, 'summarizeUpload'),
            notExists(
              db
                .select({ one: sql<number>`1` })
                .from(sql`${LlmCall} AS later`)
                .where(
                  and(
                    sql`later.upload_record_id = ${UploadRecord.id}`,
                    sql`later.activity = 'summarizeUpload'`,
                    sql`later.created_at > ${LlmCall.createdAt}`,
                  ),
                ),
            ),
          ),
        )
        .where(
          and(
            isNotNull(UploadRecord.transcribingFinishedAt),
            // Same gating reasoning as getFailedAnnotations: the join
            // restricts LlmCall to the most-recent summarize call, and
            // a successful-but-empty run already has `outcome='success'`
            // so it's excluded here. Showing uploads with a prior good
            // summary + a failed regen is intentional — the admin
            // wants to know their regen didn't take.
            sql`${LlmCall.outcome} != 'success'`,
          ),
        )
        .orderBy(desc(LlmCall.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        uploads: failedRows.map((row) => ({
          id: row.uploadId,
          title: row.title,
          channel: {
            id: row.channelId,
            name: row.channelName,
            slug: row.channelSlug,
          },
          transcribingFinishedAt: row.transcribingFinishedAt,
          lastAttempt: {
            model: row.model,
            outcome: row.outcome,
            errorMessage: row.errorMessage,
            at: row.lastAttemptAt,
          },
        })),
      };
    }),

  /** Count for the dashboard badge, mirroring `getFailedAnnotationsCount`. */
  getFailedSummariesCount: adminProcedure.query(async () => {
    const rows = await db
      .select({ cnt: count() })
      .from(UploadRecord)
      .innerJoin(
        LlmCall,
        and(
          eq(LlmCall.uploadRecordId, UploadRecord.id),
          eq(LlmCall.activity, 'summarizeUpload'),
          notExists(
            db
              .select({ one: sql<number>`1` })
              .from(sql`${LlmCall} AS later`)
              .where(
                and(
                  sql`later.upload_record_id = ${UploadRecord.id}`,
                  sql`later.activity = 'summarizeUpload'`,
                  sql`later.created_at > ${LlmCall.createdAt}`,
                ),
              ),
          ),
        ),
      )
      .where(
        and(
          isNotNull(UploadRecord.transcribingFinishedAt),
          sql`${LlmCall.outcome} != 'success'`,
        ),
      );
    return rows[0]?.cnt ?? 0;
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
            channelId: true,
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
        const links = uploadDashboardLinks(
          upload.channelId,
          input.uploadRecordId,
        );
        await startBackground('processMediaWorkflow', {
          taskQueue: BACKGROUND_QUEUE,
          workflowId,
          ...staticMeta({
            summary: `Retry processing (${scope})`,
            links,
          }),
          // Forward the links so the index/annotate/summarize children
          // inherit them too (default skipProbe = false for a retry).
          args: [input.uploadRecordId, scope, false, links],
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

  // Reprocess a single upload through the media pipeline at the chosen
  // scope (transcode / transcribe / everything). Unlike retryUploadProcessing
  // this is intentional even for fully-processed uploads, and the scope is
  // chosen by the admin rather than inferred. Runs at reprocess priority so
  // it doesn't disrupt live uploads.
  reprocessUpload: adminProcedure
    .input(
      z.object({
        uploadRecordId: z.uuid(),
        processingScope: z
          .enum(['transcode', 'transcribe', 'everything'])
          .default('everything'),
        // Reuse the stored probe instead of re-probing; falls back to a
        // live probe per-upload if none is stored. Defaults on.
        skipProbe: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          targetId: input.uploadRecordId,
          context: {
            processingScope: input.processingScope,
            skipProbe: input.skipProbe,
          },
        },
        'Reprocessing upload',
      );

      try {
        const upload = await db.query.UploadRecord.findFirst({
          where: (t, { eq }) => eq(t.id, input.uploadRecordId),
          columns: {
            id: true,
            channelId: true,
            uploadFinalized: true,
            finalizedUploadKey: true,
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
          // Workflow doesn't exist yet — fine, we'll start it.
          if (error instanceof TRPCError) {
            throw error;
          }
        }

        const links = uploadDashboardLinks(
          upload.channelId,
          input.uploadRecordId,
        );
        await startBackground('processMediaWorkflow', {
          taskQueue: BACKGROUND_QUEUE,
          workflowId,
          ...staticMeta({
            summary: `Reprocess (${input.processingScope})`,
            links,
          }),
          // Forward the links so the index/annotate/summarize children
          // inherit them too.
          args: [
            input.uploadRecordId,
            input.processingScope,
            input.skipProbe,
            links,
          ],
          priority: { priorityKey: PRIORITY_REPROCESS },
          retry: { maximumAttempts: 2 },
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.uploadRecordId,
          },
          'Upload reprocessing workflow started',
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
          'Failed to reprocess upload',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reprocess upload',
        });
      }
    }),

  // Re-runs the LLM summary chain (summarize + embed summaries + reindex
  // lc_media_v1) for a single upload, without re-transcribing. Useful for
  // spot-fixing summaries after a prompt change.
  regenerateUploadSummary: adminProcedure
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
        'Regenerating upload summary',
      );

      try {
        const upload = await db.query.UploadRecord.findFirst({
          where: (t, { eq }) => eq(t.id, input.uploadRecordId),
          columns: {
            id: true,
            channelId: true,
            transcribingFinishedAt: true,
          },
        });

        if (!upload) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found',
          });
        }

        if (!upload.transcribingFinishedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload has not finished transcribing',
          });
        }

        // Probe for at least one paragraph so we can refuse cleanly on legacy
        // uploads that haven't been through the new transcribe pipeline (the
        // summarize activity would otherwise fail mid-run with a less obvious
        // error). `select 1 ... limit 1` rather than a count — we only need
        // existence.
        const hasParagraph = await db
          .select({ id: TranscriptParagraph.id })
          .from(TranscriptParagraph)
          .where(eq(TranscriptParagraph.uploadRecordId, input.uploadRecordId))
          .limit(1);

        if (hasParagraph.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Upload has no transcript paragraphs — reprocess through the full pipeline first',
          });
        }

        const temporalClient = await client;
        const workflowId = makeSummarizeUploadWorkflowId(input.uploadRecordId);

        // Refuse a second run while one is in flight. Mirrors
        // retryUploadProcessing's RUNNING check (an unknown workflow id
        // throws, which is fine — we'll start it below). Any other
        // error from `describe()` (Temporal connectivity, auth, etc.)
        // gets logged before being swallowed so a real connectivity
        // issue isn't hidden by the workflow.start that follows.
        try {
          const handle = temporalClient.workflow.getHandle(workflowId);
          const description = await handle.describe();
          if (description.status.name === 'RUNNING') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Summary regeneration is already running',
            });
          }
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          moduleLogger.warn(
            {
              targetId: input.uploadRecordId,
              workflowId,
              context: {
                error: error instanceof Error ? error.message : String(error),
              },
            },
            'Failed to check for in-flight summarize workflow before starting a new one (likely unknown-workflow for first run; could also be Temporal connectivity)',
          );
        }

        await startBackground('summarizeUploadWorkflow', {
          taskQueue: BACKGROUND_QUEUE,
          workflowId,
          ...staticMeta({
            summary: 'Regenerate summary',
            links: uploadDashboardLinks(upload.channelId, input.uploadRecordId),
          }),
          // `force: true` — admin explicitly asked to regenerate, so the
          // activity's "skip if summary present" idempotency check must
          // be bypassed. Without this the existing summary is treated as
          // "already done" and the call no-ops.
          args: [input.uploadRecordId, { force: true }],
          retry: { maximumAttempts: 3 },
          // Same convention as the rest of the upload-scoped workflows so
          // the run is filterable by UploadId in the Temporal UI.
          typedSearchAttributes: [
            { key: UPLOAD_ID_KEY, value: input.uploadRecordId },
          ],
          // Reuse: this id is per-upload (no timestamp), so allow re-runs to
          // replace the previous completion.
          workflowIdReusePolicy: 'ALLOW_DUPLICATE',
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.uploadRecordId,
          },
          'Summary regeneration workflow started',
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
          'Failed to regenerate upload summary',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to regenerate upload summary',
        });
      }
    }),

  // Re-runs only the annotation pipeline for this upload (annotate +
  // lc_media_v1 reindex). Independent of summary regen so admins can fix
  // annotations after a prompt change without paying for the summary
  // (~$0.02 / call each for gpt-5.4-mini on a typical sermon-length
  // transcript). Same legacy-upload guard and RUNNING-check as the summary
  // procedure.
  regenerateUploadAnnotations: adminProcedure
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
        'Regenerating upload annotations',
      );

      try {
        const upload = await db.query.UploadRecord.findFirst({
          where: (t, { eq }) => eq(t.id, input.uploadRecordId),
          columns: {
            id: true,
            channelId: true,
            transcribingFinishedAt: true,
          },
        });

        if (!upload) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Upload not found',
          });
        }

        if (!upload.transcribingFinishedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Upload has not finished transcribing',
          });
        }

        const hasParagraph = await db
          .select({ id: TranscriptParagraph.id })
          .from(TranscriptParagraph)
          .where(eq(TranscriptParagraph.uploadRecordId, input.uploadRecordId))
          .limit(1);

        if (hasParagraph.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Upload has no transcript paragraphs — reprocess through the full pipeline first',
          });
        }

        const temporalClient = await client;
        const workflowId = makeAnnotateTranscriptWorkflowId(
          input.uploadRecordId,
        );

        try {
          const handle = temporalClient.workflow.getHandle(workflowId);
          const description = await handle.describe();
          if (description.status.name === 'RUNNING') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Annotation regeneration is already running',
            });
          }
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          moduleLogger.warn(
            {
              targetId: input.uploadRecordId,
              workflowId,
              context: {
                error: error instanceof Error ? error.message : String(error),
              },
            },
            'Failed to check for in-flight annotate workflow before starting a new one (likely unknown-workflow for first run; could also be Temporal connectivity)',
          );
        }

        await startBackground('annotateTranscriptWorkflow', {
          taskQueue: BACKGROUND_QUEUE,
          workflowId,
          ...staticMeta({
            summary: 'Regenerate annotations',
            links: uploadDashboardLinks(upload.channelId, input.uploadRecordId),
          }),
          // `force: true` — admin explicitly asked to regenerate, so the
          // activity's "skip if annotations present" idempotency check
          // must be bypassed. Without this any existing annotation rows
          // are treated as "already done" and the call no-ops.
          args: [input.uploadRecordId, { force: true }],
          retry: { maximumAttempts: 3 },
          typedSearchAttributes: [
            { key: UPLOAD_ID_KEY, value: input.uploadRecordId },
          ],
          workflowIdReusePolicy: 'ALLOW_DUPLICATE',
        });

        moduleLogger.info(
          {
            appUserId: ctx.session.appUserId,
            targetId: input.uploadRecordId,
          },
          'Annotation regeneration workflow started',
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
          'Failed to regenerate upload annotations',
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to regenerate upload annotations',
        });
      }
    }),

  // Admin LLM evaluation: one upload + one task + one model, returns
  // the parsed output + run stats. The page calls this once per model so
  // results stream in independently as each LLM round-trip resolves —
  // fast models render first, slow ones don't block the rest. Read-only:
  // does NOT touch the upload's persisted summary / annotations.
  evaluateLlmModel: adminProcedure
    .input(
      z.object({
        uploadRecordId: IncomingIdSchema,
        task: z.enum(['annotate', 'summarize']),
        model: z.string().min(1),
        // Override the activity's default output cap. Required for
        // providers with tight output limits (e.g. DeepSeek v3.x =
        // 8K-16K). OpenRouter rejects the request up-front when
        // `max_tokens` exceeds the model's cap, so this is the lever
        // for "make this model usable for this transcript".
        maxTokens: z.number().int().positive().max(131072).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          targetId: input.uploadRecordId,
          context: { model: input.model, task: input.task },
        },
        'Evaluating LLM model',
      );

      const upload = await db.query.UploadRecord.findFirst({
        where: (t, { eq }) => eq(t.id, input.uploadRecordId),
        columns: { id: true, title: true, description: true, channelId: true },
      });
      if (!upload) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
      }

      const channel = await db.query.Channel.findFirst({
        where: (t, { eq }) => eq(t.id, upload.channelId),
        columns: { name: true },
      });
      if (!channel) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Channel not found for upload',
        });
      }

      const paragraphs = await db
        .select({
          id: TranscriptParagraph.id,
          order: TranscriptParagraph.order,
          text: TranscriptParagraph.text,
          words: TranscriptParagraph.words,
        })
        .from(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, input.uploadRecordId))
        .orderBy(TranscriptParagraph.order);
      moduleLogger.info(
        {
          uploadRecordId: input.uploadRecordId,
          context: { paragraphCount: paragraphs.length },
        },
        'evaluateLlmModel paragraph lookup',
      );
      if (paragraphs.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Upload has no transcript paragraphs — cannot evaluate models against it',
        });
      }

      const metadata = {
        channelName: channel.name,
        title: upload.title,
        description: upload.description,
      };

      if (input.task === 'annotate') {
        const r = await runAnnotation(paragraphs, metadata, input.model, {
          maxTokens: input.maxTokens,
          tracking: {
            activity: 'evalAnnotate',
            uploadRecordId: input.uploadRecordId,
          },
        });
        return {
          task: 'annotate' as const,
          annotations: r.annotations,
          stats: r.stats,
          prompt: r.prompt,
          responseText: r.responseText,
          skippedItems: r.skippedItems,
        };
      }
      const r = await runSummary(
        paragraphs.map((p) => p.text),
        metadata,
        input.model,
        {
          maxTokens: input.maxTokens,
          tracking: {
            activity: 'evalSummarize',
            uploadRecordId: input.uploadRecordId,
          },
        },
      );
      return {
        task: 'summarize' as const,
        summary: r.summary,
        searchSummary: r.searchSummary,
        stats: r.stats,
        prompt: r.prompt,
        responseText: r.responseText,
      };
    }),

  // Loader for the LLM-eval page's upload picker. Used both to seed the
  // Select's display label when the page is opened with `uploadId` in
  // the URL (search.performSearch is keyword-based and doesn't return
  // by-id), and to give the per-model result cards the paragraph
  // source-of-record they render annotations against.
  getUploadForEval: adminProcedure
    .input(z.object({ uploadRecordId: IncomingIdSchema }))
    .query(async ({ input }) => {
      const upload = await db.query.UploadRecord.findFirst({
        where: (t, { eq }) => eq(t.id, input.uploadRecordId),
        columns: { id: true, title: true, channelId: true },
      });
      if (!upload) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found' });
      }
      const channel = await db.query.Channel.findFirst({
        where: (t, { eq }) => eq(t.id, upload.channelId),
        columns: { name: true },
      });
      const paragraphs = await db
        .select({
          id: TranscriptParagraph.id,
          order: TranscriptParagraph.order,
          text: TranscriptParagraph.text,
        })
        .from(TranscriptParagraph)
        .where(eq(TranscriptParagraph.uploadRecordId, input.uploadRecordId))
        .orderBy(TranscriptParagraph.order);
      return {
        id: upload.id,
        title: upload.title,
        channelName: channel?.name ?? '(unknown channel)',
        paragraphs,
      };
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
          channelId: true,
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
          const links = uploadDashboardLinks(upload.channelId, upload.id);
          await startBackground('processMediaWorkflow', {
            taskQueue: BACKGROUND_QUEUE,
            workflowId,
            ...staticMeta({
              summary: `Bulk retry (${scope})`,
              links,
            }),
            // Forward the links so the index/annotate/summarize children
            // inherit them too (default skipProbe = false for a retry).
            args: [upload.id, scope, false, links],
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

  // Flush the Valkey-backed search caches (query parses, related searches, and
  // final AI answers) so the next search re-parses and regenerates. No-op when
  // Valkey is unset.
  clearSearchCache: adminProcedure.mutation(async () => {
    const [parses, related, answers] = await Promise.all([
      clearByPrefix('search-parse:'),
      clearByPrefix('search-related:'),
      clearByPrefix('search-answer:'),
    ]);
    moduleLogger.info(
      { context: { parses, related, answers } },
      'Cleared search caches',
    );
    return { parses, related, answers, total: parses + related + answers };
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
      'transcript',
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
        kind: z.enum(['upload', 'transcript', 'channel', 'organization']),
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
        kind: z.enum(['upload', 'transcript', 'channel', 'organization']),
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

  // Storage audit procedures

  getStorageAuditStatus: adminProcedure.query(async () => {
    const rows = await db
      .select()
      .from(StorageAudit)
      .orderBy(desc(StorageAudit.startedAt))
      .limit(10);

    return Promise.all(
      rows.map(async (row) => {
        const liveProgress =
          row.status === 'RUNNING'
            ? await getStorageAuditProgress(row.id)
            : null;

        // Fresh short-lived link to the full report for completed runs.
        let reportUrl: string | null = null;
        if (row.reportS3Key) {
          try {
            reportUrl = await ingestS3.getSignedGetObject(row.reportS3Key, {
              expiresIn: 60 * 60, // 1 hour
              responseContentDisposition:
                'attachment; filename="storage-audit.json"',
            });
          } catch {
            reportUrl = null;
          }
        }

        return {
          id: row.id,
          status: row.status,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          error: row.error,
          summary: (row.summary as StorageAuditSummary | null) ?? null,
          liveProgress:
            liveProgress && liveProgress.status === 'running'
              ? liveProgress
              : null,
          reportUrl,
        };
      }),
    );
  }),

  startStorageAudit: adminProcedure
    .input(
      z
        .object({ shardHexLen: z.number().int().min(1).max(2).optional() })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      // Guard against concurrent runs (the workflow id is also unique per
      // audit, but this gives a clean error and avoids dangling RUNNING rows).
      const running = await db
        .select({ id: StorageAudit.id })
        .from(StorageAudit)
        .where(eq(StorageAudit.status, 'RUNNING'))
        .limit(1);
      if (running.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A storage audit is already running',
        });
      }

      const [row] = await db
        .insert(StorageAudit)
        .values({
          status: 'RUNNING',
          triggeredById: ctx.session.appUserId,
          updatedAt: new Date(),
        })
        .returning({ id: StorageAudit.id });
      if (!row) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create storage audit record',
        });
      }

      try {
        await startStorageAudit({
          auditId: row.id,
          triggeredById: ctx.session.appUserId,
          ...(input?.shardHexLen ? { shardHexLen: input.shardHexLen } : {}),
        });
      } catch (error) {
        await db
          .update(StorageAudit)
          .set({
            status: 'FAILED',
            finishedAt: new Date(),
            updatedAt: new Date(),
            error: error instanceof Error ? error.message : String(error),
          })
          .where(eq(StorageAudit.id, row.id));
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start storage audit',
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start storage audit',
        });
      }

      moduleLogger.info(
        { appUserId: ctx.session.appUserId, context: { auditId: row.id } },
        'Started storage audit',
      );
      return { success: true, auditId: row.id };
    }),

  deleteStorageAudit: adminProcedure
    .input(z.object({ auditId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select({ id: StorageAudit.id, status: StorageAudit.status })
        .from(StorageAudit)
        .where(eq(StorageAudit.id, input.auditId))
        .limit(1);
      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Storage audit not found',
        });
      }
      if (row.status === 'RUNNING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete a storage audit while it is running',
        });
      }

      // Drop the DB row now so it disappears from the admin list immediately,
      // then offload the (credentialed) S3 report cleanup to the background
      // worker. Web never touches the S3 clients, so it needs no S3 env. The
      // report objects live under the audit-reserved `_audits/` prefix, so even
      // if the cleanup workflow can't be started they're harmless dead weight,
      // never misclassified as orphans — log and move on rather than failing.
      await db.delete(StorageAudit).where(eq(StorageAudit.id, input.auditId));

      try {
        await startDeleteStorageAuditReport({ auditId: input.auditId });
      } catch (error) {
        moduleLogger.warn(
          {
            appUserId: ctx.session.appUserId,
            context: {
              auditId: input.auditId,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to start storage audit report cleanup workflow',
        );
      }

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: { auditId: input.auditId },
        },
        'Deleted storage audit',
      );
      return { success: true };
    }),

  // Reprocess procedures

  getReprocessStatus: adminProcedure.query(async () => {
    const [noParagraphsCount, noParagraphsStatus, allStatus] =
      await Promise.all([
        // Uploads with no rows in `transcript_paragraph`. Matches the
        // get-reprocess-batch helper's filter — counted here directly
        // (rather than calling the helper) so we don't have to spin up
        // the temporal activity client for a count-only read.
        db
          .select({ cnt: count() })
          .from(UploadRecord)
          .where(
            and(
              isNotNull(UploadRecord.transcodingFinishedAt),
              notExists(
                db
                  .select({ one: sql<number>`1` })
                  .from(TranscriptParagraph)
                  .where(
                    eq(TranscriptParagraph.uploadRecordId, UploadRecord.id),
                  ),
              ),
            ),
          )
          .then((r) => r[0]?.cnt ?? 0),
        getReprocessWorkflowStatus({ kind: 'no_paragraphs' }),
        getReprocessWorkflowStatus({ kind: 'all' }),
      ]);
    return {
      noParagraphsCount,
      noParagraphsStatus,
      allStatus,
    };
  }),

  startReprocess: adminProcedure
    .input(
      z.object({
        scope: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('no_paragraphs') }),
          z.object({ kind: z.literal('all') }),
          z.object({ kind: z.literal('channel'), channelSlug: z.string() }),
        ]),
        processingScope: z
          .enum(['transcode', 'transcribe', 'everything'])
          .default('transcode'),
        viaBatch: z.boolean().default(false),
        // Reuse stored probe metadata instead of re-probing. Defaults
        // on (including the no_paragraphs migration); falls back to a
        // live probe per-upload when no stored probe exists.
        skipProbe: z.boolean().default(true),
        // Optional creation/finish-date window (ISO datetimes). The
        // column applied is chosen from processingScope on the worker.
        // Not offered for the no_paragraphs migration scope.
        dateRange: z
          .object({
            start: z.string().datetime().optional(),
            end: z.string().datetime().optional(),
          })
          .optional(),
        // Only reprocess uploads that already have a video variant.
        // Ignored unless the run transcodes.
        videoOnly: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
          context: {
            scope: input.scope,
            processingScope: input.processingScope,
            viaBatch: input.viaBatch,
            skipProbe: input.skipProbe,
            dateRange: input.dateRange,
            videoOnly: input.videoOnly,
          },
        },
        'Starting reprocess',
      );

      // Pre-flight: OpenAI Batch only accepts openai/* model ids
      // (model id is rewritten by stripping the prefix before
      // submission). If a chat/embed model isn't openai/-prefixed,
      // batch mode would silently fail at submit time — reject up
      // front with a useful message.
      if (input.viaBatch) {
        const offenders: string[] = [];
        if (!SUMMARY_MODEL.startsWith('openai/')) {
          offenders.push(`SUMMARY_MODEL=${SUMMARY_MODEL}`);
        }
        if (!ANNOTATE_MODEL.startsWith('openai/')) {
          offenders.push(`ANNOTATE_MODEL=${ANNOTATE_MODEL}`);
        }
        if (!EMBED_MODEL.startsWith('openai/')) {
          offenders.push(`EMBED_MODEL=${EMBED_MODEL}`);
        }
        if (offenders.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Batch mode requires openai/* models. Non-openai configured: ${offenders.join(', ')}`,
          });
        }
      }

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

        await startReprocess(scope, input.processingScope, {
          viaBatch: input.viaBatch,
          skipProbe: input.skipProbe,
          dateStart: input.dateRange?.start,
          dateEnd: input.dateRange?.end,
          videoOnly: input.videoOnly,
        });
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
          z.object({ kind: z.literal('no_paragraphs') }),
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

  getMaintenanceSettings: adminProcedure.query(async () => {
    return getMaintenanceSettings();
  }),

  setMaintenanceMode: adminProcedure
    .input(setMaintenanceModeSchema)
    .mutation(async ({ ctx, input }) => {
      await setMaintenanceConfig({
        maintenanceMode: input.maintenanceMode,
        maintenanceMessage: input.maintenanceMessage,
        updatedById: ctx.session.appUserId,
      });

      moduleLogger.warn(
        {
          appUserId: ctx.session.appUserId,
          context: { maintenanceMode: input.maintenanceMode },
        },
        input.maintenanceMode
          ? 'Maintenance mode ENABLED'
          : 'Maintenance mode DISABLED',
      );

      return { success: true, maintenanceMode: input.maintenanceMode };
    }),
});
