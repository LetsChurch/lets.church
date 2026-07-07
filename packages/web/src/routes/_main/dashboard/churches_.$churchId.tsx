import { IconShield, IconUsers, IconVideo } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { Avatar, Badge, Button, Text, Title, Tooltip } from '@/components/ui';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

import { StatCard } from './-components/stat-card';

import styles from './-styles.module.css';

export const Route = createFileRoute('/_main/dashboard/churches_/$churchId')({
  component: ChurchDetailsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.churches.getChurchDetails.queryOptions({
        churchId: params.churchId,
      }),
    );
    return {
      backNavigation: {
        label: 'Churches',
        to: '/dashboard/churches',
      },
    };
  },
});

function ChurchDetailsPage() {
  const { churchId } = Route.useParams();
  const trpc = useTRPC();

  const { data: church } = useSuspenseQuery(
    trpc.dashboard.churches.getChurchDetails.queryOptions({
      churchId,
    }),
  );

  const { userMembership } = church;
  const isAdmin = userMembership?.isAdmin ?? false;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-start justify-start gap-4">
          <Avatar
            src={church.avatarUrl}
            alt={church.name}
            className="size-14"
          />
          <div>
            <div className="mb-2.5 flex flex-wrap items-center justify-start gap-3">
              <Title order={1}>{church.name}</Title>
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
            </div>
            <div className="mb-3 flex flex-wrap items-center justify-start gap-4">
              <Text c="dimmed">@{church.slug}</Text>
              <Text c="dimmed" size="sm">
                Founded {formatDate(church.createdAt)}
              </Text>
            </div>
            {church.description && (
              <Text size="sm" className="max-w-[600px]">
                {church.description}
              </Text>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-4">
          {isAdmin && (
            <Button
              variant="light"
              component={Link}
              to="/dashboard/churches/$churchId/edit"
              params={{ churchId: church.id }}
              className={styles.buttonLink}
            >
              Edit Church
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {isAdmin && (
          <StatCard
            title="Users"
            to="/dashboard/churches/$churchId/members"
            color="blue"
            icon={<IconUsers size={22} stroke={1.5} />}
            tooltip="People who can view and edit this church profile"
            value={church._count.memberships}
          />
        )}

        <StatCard
          title="Channels"
          to="/dashboard/churches/$churchId/channels"
          color="green"
          icon={<IconVideo size={22} stroke={1.5} />}
          tooltip="Media channels associated with this church"
          value={church._count.channelAssociations}
        />

        <StatCard
          title="Leaders"
          to="/dashboard/churches/$churchId/leaders"
          color="violet"
          icon={<IconShield size={22} stroke={1.5} />}
          tooltip="Church pastors, elders, and ministry leadership"
          value={church._count.leaders}
        />
      </div>
    </div>
  );
}
