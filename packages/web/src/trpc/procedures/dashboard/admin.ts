import { prisma } from '@letschurch/db';
import { parseS3Env } from '@letschurch/s3';
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
  cancelBackfillUploadStateSizes,
  cancelBackfillUploadStates,
  cancelBulkBackupToGlacier,
  cancelMigrateViewRanges,
  getBackfillUploadStateSizesProgress,
  getBackfillUploadStatesProgress,
  getBulkBackupToGlacierProgress,
  getMigrateViewRangesProgress,
  startBackfillUploadStateSizes,
  startBackfillUploadStates,
  startBulkBackupToGlacier,
  startMigrateViewRanges,
} from '@/temporal';
import logger from '@/util/logger';
import { publicS3 } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/admin',
});

const adminProcedure = authProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.appUser.role !== 'ADMIN') {
    moduleLogger.warn('Non-admin user attempted admin action', {
      appUserId: ctx.session.appUserId,
      role: ctx.session.appUser.role,
    });

    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  return next();
});

export const adminRouter = router({
  getPendingApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending approvals');

    const [
      pendingChannels,
      pendingOrganizations,
      userCount,
      processingUploadsCount,
    ] = await Promise.all([
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
      prisma.uploadRecord.count({
        where: {
          OR: [
            { transcodingFinishedAt: null },
            { transcribingFinishedAt: null },
          ],
        },
      }),
    ]);

    return {
      channels: pendingChannels,
      organizations: pendingOrganizations,
      userCount,
      processingUploadsCount,
    };
  }),

  getPendingChannelApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending channel approvals');

    return prisma.channel.findMany({
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
  }),

  getPendingOrganizationApprovals: adminProcedure.query(async () => {
    moduleLogger.info('Fetching pending organization approvals');

    return prisma.organization.findMany({
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
  }),

  approveChannel: adminProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Approving channel', {
        channelId: input.channelId,
        appUserId: ctx.session.appUserId,
      });

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

        moduleLogger.info('Channel approved successfully', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to approve channel', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve channel',
        });
      }
    }),

  approveOrganization: adminProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Approving organization', {
        organizationId: input.organizationId,
        appUserId: ctx.session.appUserId,
      });

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

        moduleLogger.info('Organization approved successfully', {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to approve organization', {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve organization',
        });
      }
    }),

  deleteChannel: adminProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Deleting channel', {
        channelId: input.channelId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await prisma.channel.delete({
          where: {
            id: input.channelId,
          },
        });

        moduleLogger.info('Channel deleted successfully', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to delete channel', {
          channelId: input.channelId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete channel',
        });
      }
    }),

  deleteOrganization: adminProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Deleting organization', {
        organizationId: input.organizationId,
        appUserId: ctx.session.appUserId,
      });

      try {
        await prisma.organization.delete({
          where: {
            id: input.organizationId,
          },
        });

        moduleLogger.info('Organization deleted successfully', {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to delete organization', {
          organizationId: input.organizationId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

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
      moduleLogger.info('Upserting organization tag', {
        slug: input.slug,
        appUserId: ctx.session.appUserId,
      });

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

        moduleLogger.info('Organization tag upserted successfully', {
          tagSlug: tag.slug,
          appUserId: ctx.session.appUserId,
        });

        return tag;
      } catch (error) {
        moduleLogger.error('Failed to upsert organization tag', {
          slug: input.slug,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to upsert organization tag',
        });
      }
    }),

  deleteOrganizationTag: adminProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Deleting organization tag', {
        tagSlug: input.slug,
        appUserId: ctx.session.appUserId,
      });

      try {
        await prisma.organizationTag.delete({
          where: { slug: input.slug },
        });

        moduleLogger.info('Organization tag deleted successfully', {
          tagSlug: input.slug,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to delete organization tag', {
          tagSlug: input.slug,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

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
          where: {
            verifiedAt: { not: null },
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
        email: z.string().email(),
        role: z.enum(['USER', 'ADMIN']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Creating user', {
        username: input.username,
        email: input.email,
        role: input.role,
        appUserId: ctx.session.appUserId,
      });

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

        moduleLogger.info('User created successfully', {
          userId: user.id,
          username: user.username,
          appUserId: ctx.session.appUserId,
        });

        return user;
      } catch (error) {
        moduleLogger.error('Failed to create user', {
          username: input.username,
          email: input.email,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create user',
        });
      }
    }),

  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        username: z.string().min(1).optional(),
        fullName: z.string().optional(),
        role: z.enum(['USER', 'ADMIN']).optional(),
        email: z.string().email().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Updating user', {
        userId: input.userId,
        appUserId: ctx.session.appUserId,
      });

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
          where: { id: input.userId },
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
              appUserId: input.userId,
              verifiedAt: { not: null },
            },
            data: {
              email: input.email,
            },
          });
        }

        moduleLogger.info('User updated successfully', {
          userId: input.userId,
          appUserId: ctx.session.appUserId,
        });

        return user;
      } catch (error) {
        moduleLogger.error('Failed to update user', {
          userId: input.userId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user',
        });
      }
    }),

  getProcessingUploads: adminProcedure.query(async () => {
    moduleLogger.info('Fetching processing uploads');

    return prisma.uploadRecord.findMany({
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
        channel: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      where: {
        OR: [{ transcodingFinishedAt: null }, { transcribingFinishedAt: null }],
      },
      orderBy: { createdAt: 'desc' },
    });
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
      const thumbnailPath =
        uploadRecord.overrideThumbnailPath ?? uploadRecord.defaultThumbnailPath;

      const thumbnailUrl = thumbnailPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(thumbnailPath), {
            resize: { width: 120, height: 68 },
          })
        : null;

      const channelDefaultThumbnailUrl = uploadRecord.channel
        .defaultThumbnailPath
        ? getPublicImageUrl(
            publicS3.getS3ProtocolUri(
              uploadRecord.channel.defaultThumbnailPath,
            ),
            {
              resize: { width: 120, height: 68 },
            },
          )
        : null;

      return {
        ...rest,
        uploadRecord: {
          ...uploadRecord,
          thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
        },
      };
    });
  }),

  addFeaturedUpload: adminProcedure
    .input(addFeaturedUploadSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Adding featured upload', {
        uploadId: input.uploadId,
        appUserId: ctx.session.appUserId,
      });

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

        moduleLogger.info('Featured upload added successfully', {
          uploadId: input.uploadId,
          rank: newRank,
          appUserId: ctx.session.appUserId,
        });

        return featuredUpload;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error('Failed to add featured upload', {
          uploadId: input.uploadId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add featured upload',
        });
      }
    }),

  removeFeaturedUpload: adminProcedure
    .input(removeFeaturedUploadSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Removing featured upload', {
        uploadId: input.uploadId,
        appUserId: ctx.session.appUserId,
      });

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

        moduleLogger.info('Featured upload removed successfully', {
          uploadId: input.uploadId,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error('Failed to remove featured upload', {
          uploadId: input.uploadId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to remove featured upload',
        });
      }
    }),

  reorderFeaturedUploads: adminProcedure
    .input(reorderFeaturedUploadsSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Reordering featured uploads', {
        uploadIds: input.uploadIds,
        appUserId: ctx.session.appUserId,
      });

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

        moduleLogger.info('Featured uploads reordered successfully', {
          uploadIds: input.uploadIds,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error('Failed to reorder featured uploads', {
          uploadIds: input.uploadIds,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reorder featured uploads',
        });
      }
    }),

  toggleFeaturedUpload: adminProcedure
    .input(z.object({ uploadId: IncomingIdSchema }))
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Toggling featured upload', {
        uploadId: input.uploadId,
        appUserId: ctx.session.appUserId,
      });

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

          moduleLogger.info('Upload removed from featured', {
            uploadId: input.uploadId,
            appUserId: ctx.session.appUserId,
          });

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

        moduleLogger.info('Upload added to featured', {
          uploadId: input.uploadId,
          rank: newRank,
          appUserId: ctx.session.appUserId,
        });

        return { isFeatured: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error('Failed to toggle featured upload', {
          uploadId: input.uploadId,
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to toggle featured upload',
        });
      }
    }),

  // View Ranges Migration procedures
  getViewRangesMigrationStatus: adminProcedure.query(async () => {
    moduleLogger.info('Fetching view ranges migration status');

    const [remainingCount, secondsCount, progress] = await Promise.all([
      prisma.uploadViewRanges.count(),
      prisma.uploadViewSecond.count(),
      getMigrateViewRangesProgress(),
    ]);

    return {
      remainingCount,
      secondsCount,
      workflowStatus: progress,
    };
  }),

  startViewRangesMigration: adminProcedure
    .input(
      z.object({
        batchSize: z.number().min(1).max(1000).default(100),
        delayBetweenBatchesMs: z.number().min(0).max(10000).default(100),
        maxRows: z.number().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Starting view ranges migration', {
        batchSize: input.batchSize,
        delayBetweenBatchesMs: input.delayBetweenBatchesMs,
        maxRows: input.maxRows,
        appUserId: ctx.session.appUserId,
      });

      try {
        // Check if migration is already running
        const progress = await getMigrateViewRangesProgress();
        if (progress?.status === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Migration is already running',
          });
        }

        await startMigrateViewRanges({
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          maxRows: input.maxRows,
        });

        moduleLogger.info('View ranges migration started successfully', {
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          maxRows: input.maxRows,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error('Failed to start view ranges migration', {
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start migration',
        });
      }
    }),

  cancelViewRangesMigration: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info('Cancelling view ranges migration', {
      appUserId: ctx.session.appUserId,
    });

    try {
      await cancelMigrateViewRanges();

      moduleLogger.info('View ranges migration cancelled successfully', {
        appUserId: ctx.session.appUserId,
      });

      return { success: true };
    } catch (error) {
      moduleLogger.error('Failed to cancel view ranges migration', {
        appUserId: ctx.session.appUserId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel migration',
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
      moduleLogger.info('Starting backfill upload states', {
        batchSize: input.batchSize,
        delayBetweenBatchesMs: input.delayBetweenBatchesMs,
        maxRows: input.maxRows,
        appUserId: ctx.session.appUserId,
      });

      try {
        // Check if backfill is already running
        const progress = await getBackfillUploadStatesProgress();
        if (progress?.status === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Backfill is already running',
          });
        }

        const s3Env = parseS3Env();

        await startBackfillUploadStates({
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          ingestBucket: s3Env.S3_INGEST_BUCKET,
          maxRows: input.maxRows,
        });

        moduleLogger.info('Backfill upload states started successfully', {
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          maxRows: input.maxRows,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error('Failed to start backfill upload states', {
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start backfill',
        });
      }
    }),

  cancelBackfillUploadStates: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info('Cancelling backfill upload states', {
      appUserId: ctx.session.appUserId,
    });

    try {
      await cancelBackfillUploadStates();

      moduleLogger.info('Backfill upload states cancelled successfully', {
        appUserId: ctx.session.appUserId,
      });

      return { success: true };
    } catch (error) {
      moduleLogger.error('Failed to cancel backfill upload states', {
        appUserId: ctx.session.appUserId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel backfill',
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
      moduleLogger.info('Starting backfill upload state sizes', {
        batchSize: input.batchSize,
        delayBetweenBatchesMs: input.delayBetweenBatchesMs,
        maxRows: input.maxRows,
        appUserId: ctx.session.appUserId,
      });

      try {
        // Check if backfill is already running
        const progress = await getBackfillUploadStateSizesProgress();
        if (progress?.status === 'running') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Backfill sizes is already running',
          });
        }

        const s3Env = parseS3Env();

        await startBackfillUploadStateSizes({
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          ingestBucket: s3Env.S3_INGEST_BUCKET,
          ingestEndpoint: s3Env.S3_INGEST_ENDPOINT,
          ingestRegion: s3Env.S3_INGEST_REGION,
          ingestAccessKeyId: s3Env.S3_INGEST_ACCESS_KEY_ID,
          ingestSecretAccessKey: s3Env.S3_INGEST_SECRET_ACCESS_KEY,
          maxRows: input.maxRows,
        });

        moduleLogger.info('Backfill upload state sizes started successfully', {
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          maxRows: input.maxRows,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error('Failed to start backfill upload state sizes', {
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start backfill sizes',
        });
      }
    }),

  cancelBackfillUploadStateSizes: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info('Cancelling backfill upload state sizes', {
      appUserId: ctx.session.appUserId,
    });

    try {
      await cancelBackfillUploadStateSizes();

      moduleLogger.info('Backfill upload state sizes cancelled successfully', {
        appUserId: ctx.session.appUserId,
      });

      return { success: true };
    } catch (error) {
      moduleLogger.error('Failed to cancel backfill upload state sizes', {
        appUserId: ctx.session.appUserId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel backfill sizes',
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
      moduleLogger.info('Starting bulk backup to Glacier', {
        batchSize: input.batchSize,
        delayBetweenBatchesMs: input.delayBetweenBatchesMs,
        maxUploads: input.maxUploads,
        appUserId: ctx.session.appUserId,
      });

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

        moduleLogger.info('Bulk backup to Glacier started successfully', {
          batchSize: input.batchSize,
          delayBetweenBatchesMs: input.delayBetweenBatchesMs,
          maxUploads: input.maxUploads,
          appUserId: ctx.session.appUserId,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error('Failed to start bulk backup to Glacier', {
          appUserId: ctx.session.appUserId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start bulk backup',
        });
      }
    }),

  cancelBulkBackupToGlacier: adminProcedure.mutation(async ({ ctx }) => {
    moduleLogger.info('Cancelling bulk backup to Glacier', {
      appUserId: ctx.session.appUserId,
    });

    try {
      await cancelBulkBackupToGlacier();

      moduleLogger.info('Bulk backup to Glacier cancelled successfully', {
        appUserId: ctx.session.appUserId,
      });

      return { success: true };
    } catch (error) {
      moduleLogger.error('Failed to cancel bulk backup to Glacier', {
        appUserId: ctx.session.appUserId,
        error: error instanceof Error ? error.message : String(error),
      });

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
});
