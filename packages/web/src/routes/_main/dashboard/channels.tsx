import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { DashboardPageHeader } from '@/components/dashboard/dashboard-ui';
import {
  MenuItemButton,
  MenuItemRouterLink,
  OverflowMenu,
} from '@/components/lc-menu';
import { Badge, Button } from '@/components/ui';
import { useTRPC } from '@/trpc/react';

import { DashboardEntityCard } from './-components/dashboard-entity-card';

export const Route = createFileRoute('/_main/dashboard/channels')({
  component: ChannelsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    // Prime the channels query (read back via useSuspenseQuery in the
    // component); backNavigation is loader-only data the dashboard layout reads.
    await queryClient.ensureQueryData(
      trpc.dashboard.channels.getChannels.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Dashboard',
        to: '/dashboard',
      },
    };
  },
});

function ChannelsPage() {
  const trpc = useTRPC();
  const { data: channels } = useSuspenseQuery(
    trpc.dashboard.channels.getChannels.queryOptions(),
  );

  return (
    <>
      <DashboardPageHeader
        eyebrow="Publishing"
        title="My channels"
        description="Create and maintain the channels that organize your sermons, livestreams, and other media."
        actions={
          <Button
            component={Link}
            to="/dashboard/channels/new"
            leftSection={<IconPlus size={16} />}
          >
            Create channel
          </Button>
        }
      />

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {channels.map((channel) => {
            const { isAdmin } = channel.memberships[0];

            return (
              <DashboardEntityCard
                key={channel.id}
                heading={channel.name}
                description={
                  isAdmin
                    ? 'You have administrative access to this channel.'
                    : 'You are a member of this channel.'
                }
                controls={
                  <>
                    <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                      {isAdmin ? 'Admin' : 'Member'}
                    </Badge>
                    {isAdmin ? (
                      <OverflowMenu
                        label={`Actions for ${channel.name}`}
                        sideOffset={8}
                      >
                        <MenuItemRouterLink
                          to="/dashboard/channels/$channelId/edit"
                          params={{ channelId: channel.id }}
                          icon={<IconEdit size={14} />}
                        >
                          Edit
                        </MenuItemRouterLink>
                        <MenuItemButton
                          icon={<IconTrash size={14} />}
                          className="text-red-600 dark:text-red-400"
                        >
                          Delete
                        </MenuItemButton>
                      </OverflowMenu>
                    ) : null}
                  </>
                }
                to="/dashboard/channels/$channelId"
                params={{ channelId: channel.id }}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
