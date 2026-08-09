import { IconEye, IconSettings, IconUserMinus } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import {
  MenuItemButton,
  MenuItemRouterLink,
  OverflowMenu,
} from '@/components/lc-menu';
import { Badge, Button, Text, Title, Tooltip } from '@/components/ui';
import { useTRPC } from '@/trpc/react';

import { DashboardEntityCard } from './-components/dashboard-entity-card';

export const Route = createFileRoute('/_main/dashboard/churches')({
  component: ChurchesPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.churches.getChurches.queryOptions(),
    );
    return {
      data,
      backNavigation: {
        label: 'Dashboard',
        to: '/dashboard',
      },
    };
  },
});

function ChurchesPage() {
  const trpc = useTRPC();
  const { data: churches } = useSuspenseQuery(
    trpc.dashboard.churches.getChurches.queryOptions(),
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <Title order={1}>Churches</Title>
        <Button
          component={Link}
          to="/dashboard/churches/new"
          className="content-center"
        >
          Add Church
        </Button>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <Text fw={500} className="mb-2.5">
            Church Management
          </Text>
          <Text size="sm" c="dimmed" className="mb-5">
            Manage your church profiles and organizational information. Update
            details, manage users, and maintain your church presence.
          </Text>
        </div>

        <Text fw={500} size="lg">
          My Churches
        </Text>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {churches.map((church) => {
            const membership = church.memberships[0];
            const isAdmin = membership?.isAdmin ?? false;

            return (
              <DashboardEntityCard
                key={church.id}
                heading={church.name}
                truncateHeading
                description={
                  church.description ||
                  (isAdmin
                    ? 'You have administrative access to this church.'
                    : 'You have user access to this church profile.')
                }
                controls={
                  <>
                    <Tooltip
                      label={
                        isAdmin
                          ? 'You can edit this church profile and manage settings'
                          : 'You have access to view this church profile'
                      }
                      withArrow
                    >
                      <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                        {isAdmin ? 'Admin' : 'User'}
                      </Badge>
                    </Tooltip>
                    <OverflowMenu label={`Actions for ${church.name}`}>
                      <MenuItemRouterLink
                        to="/dashboard/churches/$churchId"
                        params={{ churchId: church.id }}
                        icon={<IconEye size={14} />}
                      >
                        View Details
                      </MenuItemRouterLink>
                      {isAdmin && (
                        <MenuItemRouterLink
                          to="/dashboard/churches/$churchId/edit"
                          params={{ churchId: church.id }}
                          icon={<IconSettings size={14} />}
                        >
                          Manage
                        </MenuItemRouterLink>
                      )}
                      <MenuItemButton
                        icon={<IconUserMinus size={14} />}
                        className="text-red-600 dark:text-red-400"
                      >
                        Leave Church
                      </MenuItemButton>
                    </OverflowMenu>
                  </>
                }
                to="/dashboard/churches/$churchId"
                params={{ churchId: church.id }}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
