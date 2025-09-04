import { OrganizationType } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { churchQuerySchema } from '@/schemas/dashboard';
import db from '@/util/db';
import logger from '@/util/logger';
import { authProcedure } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/churches',
});

export const churchesProcedures = {
  getChurches: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info('Fetching churches for user', {
      appUserId: ctx.session.appUserId,
    });

    return db.organization.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        memberships: {
          select: {
            isAdmin: true,
            canEdit: true,
          },
          where: {
            appUserId: ctx.session.appUserId,
          },
        },
      },
      where: {
        type: OrganizationType.CHURCH,
        memberships: {
          some: {
            appUserId: ctx.session.appUserId,
          },
        },
      },
    });
  }),

  getChurchDetails: authProcedure
    .input(churchQuerySchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info('Fetching church details', {
        ...input,
        appUserId: ctx.session.appUserId,
      });

      const church = await db.organization.findFirst({
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          avatarPath: true,
          primaryEmail: true,
          primaryPhoneNumber: true,
          websiteUrl: true,
          createdAt: true,
          updatedAt: true,
          memberships: {
            select: {
              isAdmin: true,
              canEdit: true,
              appUser: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  emails: {
                    select: {
                      email: true,
                      verifiedAt: true,
                    },
                  },
                },
              },
            },
          },
          channelAssociations: {
            select: {
              channel: {
                select: {
                  id: true,
                  name: true,
                  visibility: true,
                  createdAt: true,
                },
              },
              officialChannel: true,
            },
          },
          leaders: {
            select: {
              id: true,
              type: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
          addresses: {
            select: {
              id: true,
              type: true,
              name: true,
              streetAddress: true,
              locality: true,
              region: true,
              postalCode: true,
              country: true,
            },
          },
          _count: {
            select: {
              memberships: true,
              channelAssociations: true,
              leaders: true,
            },
          },
        },
        where: {
          id: input.churchId,
          type: 'CHURCH',
          memberships: {
            some: {
              appUserId: ctx.session.appUserId,
            },
          },
        },
      });

      if (!church) {
        moduleLogger.warn('Church not found', {
          ...input,
          appUserId: ctx.session.appUserId,
        });

        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const userMembership = church.memberships.find(
        (m) => m.appUser.id === ctx.session?.appUserId,
      );

      return {
        ...church,
        userMembership,
      };
    }),
};
