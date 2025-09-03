import { OrganizationType } from '@prisma/client';
import { churchQuerySchema } from '@/schemas/dashboard';
import db from '@/util/db';
import logger from '@/util/logger';
import { authProcedure, router } from '../../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/dashboard/churches',
});

export const churchesProcedures = {
  getChurches: authProcedure.query(async ({ ctx }) => {
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
        throw new Error('Church not found');
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